const fs = require('fs');
const axios = require('axios');
const path = require('path');

const CONFIG = {
    PROXY_SOURCES: [
        {
            url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
            type: 'http'
        },
        {
            url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt',
            type: 'socks4'
        },
        {
            url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
            type: 'socks5'
        }
    ],
    PROXY_FILE: 'proxy.txt',
    LOG_FILE: 'proxy_manager.log',
    CHECK_INTERVAL: 2 * 60 * 60 * 1000, // 2 hours
    REFRESH_INTERVAL: 30 * 60 * 1000, // 30 minutes
    MIN_PROXIES: 1000,
    TIMEOUT: 10000,
    CHECK_URLS: [
        'http://ip-api.com/json',
        'https://api.ipify.org?format=json',
        'http://httpbin.org/ip'
    ],
    CONCURRENT_CHECKS: 100,
    RETRY_ATTEMPTS: 2,
    KEEP_ALIVE_TIME: 2 * 60 * 60 * 1000 // 2 hours before recheck
};

class ProxyManager {
    constructor() {
        this.workingProxies = new Map();
        this.isRunning = false;
        this.proxyQueue = [];
        this.failureCount = new Map();
        this.setupLogDir();
        this.loadExistingProxies();
    }

    setupLogDir() {
        const logDir = 'logs';
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir);
        }
    }

    loadExistingProxies() {
        try {
            if (fs.existsSync(CONFIG.PROXY_FILE)) {
                const content = fs.readFileSync(CONFIG.PROXY_FILE, 'utf8');
                const proxies = content.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && line.includes(':'));
                
                proxies.forEach(proxy => {
                    const cleanProxy = proxy.split('::')[0]; // Remove empty auth
                    this.workingProxies.set(cleanProxy, Date.now());
                });
                this.log(`Loaded ${this.workingProxies.size} existing proxies`);
            }
        } catch (error) {
            this.log(`Error loading existing proxies: ${error.message}`);
            fs.writeFileSync(CONFIG.PROXY_FILE, '');
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        console.log(message);
        fs.appendFileSync(path.join('logs', CONFIG.LOG_FILE), logMessage);
    }

    async checkProxy(proxy, type = 'http') {
        const urls = [...CONFIG.CHECK_URLS];
        for (let i = 0; i < CONFIG.RETRY_ATTEMPTS; i++) {
            try {
                const [host, port] = proxy.split(':');
                const proxyConfig = {
                    proxy: {
                        host,
                        port,
                        protocol: type
                    },
                    timeout: CONFIG.TIMEOUT
                };

                // Try different URLs if previous fails
                for (const url of urls) {
                    try {
                        const response = await axios.get(url, proxyConfig);
                        if (response.status === 200) {
                            return true;
                        }
                    } catch (e) {
                        continue;
                    }
                }
            } catch {
                continue;
            }
        }
        return false;
    }

    async fetchProxies() {
        let newProxies = new Set();
        
        const fetchPromises = CONFIG.PROXY_SOURCES.map(async source => {
            try {
                const response = await axios.get(source.url);
                const proxyList = response.data.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'))
                    .map(line => line.split(':').slice(0, 2).join(':'));
                
                proxyList.forEach(proxy => newProxies.add(proxy));
                this.log(`✅ Fetched ${proxyList.length} ${source.type} proxies`);
            } catch (error) {
                this.log(`❌ Failed to fetch ${source.type} proxies: ${error.message}`);
            }
        });

        await Promise.all(fetchPromises);
        return Array.from(newProxies);
    }

    shouldRecheckProxy(proxy) {
        const lastCheck = this.workingProxies.get(proxy);
        return Date.now() - lastCheck > CONFIG.KEEP_ALIVE_TIME;
    }

    async verifyAndUpdateProxies() {
        if (!this.isRunning) return;

        const existingProxies = Array.from(this.workingProxies.keys())
            .filter(proxy => this.shouldRecheckProxy(proxy));

        if (existingProxies.length > 0) {
            this.log(`Checking ${existingProxies.length} proxies that need verification...`);
            
            const batches = [];
            for (let i = 0; i < existingProxies.length; i += CONFIG.CONCURRENT_CHECKS) {
                batches.push(existingProxies.slice(i, i + CONFIG.CONCURRENT_CHECKS));
            }

            for (const batch of batches) {
                if (!this.isRunning) return;

                const checkPromises = batch.map(async proxy => {
                    if (await this.checkProxy(proxy)) {
                        this.workingProxies.set(proxy, Date.now());
                        this.failureCount.delete(proxy);
                    } else {
                        const failures = (this.failureCount.get(proxy) || 0) + 1;
                        if (failures >= 3) {
                            this.workingProxies.delete(proxy);
                            this.failureCount.delete(proxy);
                            this.log(`❌ Removed consistently failing proxy: ${proxy}`);
                        } else {
                            this.failureCount.set(proxy, failures);
                        }
                    }
                });

                await Promise.all(checkPromises);
                this.saveProxies();
            }
        }

        // Add new proxies if needed
        if (this.workingProxies.size < CONFIG.MIN_PROXIES) {
            this.log(`Need ${CONFIG.MIN_PROXIES - this.workingProxies.size} more proxies, fetching...`);
            await this.addNewProxies();
        }
    }

    async addNewProxies() {
        const newProxies = await this.fetchProxies();
        const batches = [];
        for (let i = 0; i < newProxies.length; i += CONFIG.CONCURRENT_CHECKS) {
            batches.push(newProxies.slice(i, i + CONFIG.CONCURRENT_CHECKS));
        }

        for (const batch of batches) {
            if (!this.isRunning || this.workingProxies.size >= CONFIG.MIN_PROXIES) break;

            const checkPromises = batch.map(async proxy => {
                if (!this.workingProxies.has(proxy) && await this.checkProxy(proxy)) {
                    this.workingProxies.set(proxy, Date.now());
                    this.log(`✅ Added new working proxy: ${proxy}`);
                }
            });

            await Promise.all(checkPromises);
            this.saveProxies();
        }
    }

    saveProxies() {
        const proxyList = Array.from(this.workingProxies.keys())
            .map(proxy => `${proxy}::`);
        fs.writeFileSync(CONFIG.PROXY_FILE, proxyList.join('\n'));
        this.log(`✅ Saved ${proxyList.length} working proxies to ${CONFIG.PROXY_FILE}`);
    }

    async start() {
        if (this.isRunning) {
            this.log('Proxy manager is already running');
            return;
        }

        this.isRunning = true;
        this.log('Starting proxy manager...');

        await this.verifyAndUpdateProxies();

        setInterval(async () => {
            if (this.isRunning) {
                await this.verifyAndUpdateProxies();
            }
        }, CONFIG.CHECK_INTERVAL);

        setInterval(async () => {
            if (this.isRunning && this.workingProxies.size < CONFIG.MIN_PROXIES) {
                await this.addNewProxies();
            }
        }, CONFIG.REFRESH_INTERVAL);
    }

    stop() {
        this.log('Stopping proxy manager...');
        this.isRunning = false;
    }
}

module.exports = new ProxyManager();

if (require.main === module) {
    const manager = module.exports;
    manager.start();

    process.on('SIGTERM', () => {
        manager.stop();
        process.exit(0);
    });

    process.on('SIGINT', () => {
        manager.stop();
        process.exit(0);
    });

    process.on('uncaughtException', (error) => {
        manager.log(`Uncaught error: ${error.message}`);
        manager.stop();
        process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
        manager.log(`Unhandled rejection: ${reason}`);
        manager.stop();
        process.exit(1);
    });

    process.on('exit', () => {
        manager.log('Process exit detected, cleaning up...');
        if (manager.isRunning) {
            manager.stop();
        }
    });
}
