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
    CHECK_INTERVAL: 30000,
    REFRESH_INTERVAL: 15 * 60 * 1000,
    MIN_PROXIES: 500,
    TIMEOUT: 10000,
    CHECK_URL: 'https://api.ipify.org?format=json',
    MAX_RETRIES: 3,
    RETRY_DELAY: 5000
};

class ProxyManager {
    constructor() {
        this.workingProxies = new Map();
        this.isRunning = false;
        this.proxyQueue = [];
        this.retryCount = 0;
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
                    const cleanProxy = proxy.split(':').slice(0, 2).join(':');
                    this.workingProxies.set(cleanProxy, Date.now());
                });
                this.log(`Loaded ${this.workingProxies.size} existing proxies`);
            }
        } catch (error) {
            this.log(`Error loading existing proxies: ${error.message}`);
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        console.log(message);
        fs.appendFileSync(path.join('logs', CONFIG.LOG_FILE), logMessage);
    }

    async checkProxy(proxy, retryCount = 0) {
        try {
            const [host, port] = proxy.split(':');
            const proxyConfig = {
                proxy: {
                    host,
                    port,
                    protocol: 'http'
                },
                timeout: CONFIG.TIMEOUT
            };

            const response = await axios.get(CONFIG.CHECK_URL, proxyConfig);
            return response.data && response.data.ip ? true : false;
        } catch (error) {
            if (retryCount < CONFIG.MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
                return this.checkProxy(proxy, retryCount + 1);
            }
            return false;
        }
    }

    async fetchProxies() {
        let newProxies = new Set();
        
        for (const source of CONFIG.PROXY_SOURCES) {
            try {
                this.log(`Fetching ${source.type} proxies...`);
                const response = await axios.get(source.url);
                const proxyList = response.data.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'))
                    .map(line => line.split(':').slice(0, 2).join(':'));
                
                proxyList.forEach(proxy => newProxies.add(proxy));
                this.log(`✅ Added ${proxyList.length} ${source.type} proxies to check`);
            } catch (error) {
                this.log(`❌ Failed to fetch ${source.type} proxies: ${error.message}`);
            }
        }
        return Array.from(newProxies);
    }

    getNextProxy() {
        if (this.proxyQueue.length === 0) {
            this.proxyQueue = Array.from(this.workingProxies.keys());
        }
        return this.proxyQueue.shift();
    }

    async verifyAndUpdateProxies() {
        if (!this.isRunning) return;

        const existingProxies = Array.from(this.workingProxies.keys());
        this.log(`Checking ${existingProxies.length} existing proxies...`);
        
        const checkPromises = existingProxies.map(async proxy => {
            if (!this.isRunning) return;
            
            const isWorking = await this.checkProxy(proxy);
            if (!isWorking) {
                this.workingProxies.delete(proxy);
                this.log(`❌ Removed non-working proxy: ${proxy}`);
                await this.addNewWorkingProxy();
            } else {
                this.workingProxies.set(proxy, Date.now());
            }
        });

        await Promise.allSettled(checkPromises);

        while (this.workingProxies.size < CONFIG.MIN_PROXIES) {
            if (!this.isRunning) return;
            await this.addNewWorkingProxy();
        }

        this.saveProxies();
        this.log(`Current working proxies: ${this.workingProxies.size}`);
    }

    async addNewWorkingProxy() {
        const newProxies = await this.fetchProxies();
        
        for (const proxy of newProxies) {
            if (!this.isRunning) return;
            if (!this.workingProxies.has(proxy) && await this.checkProxy(proxy)) {
                this.workingProxies.set(proxy, Date.now());
                this.log(`✅ Added new working proxy: ${proxy}`);
                this.saveProxies();
                return true;
            }
        }
        return false;
    }

    saveProxies() {
        const proxyList = Array.from(this.workingProxies.keys());
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
            if (this.isRunning) {
                await this.addNewWorkingProxy();
            }
        }, CONFIG.REFRESH_INTERVAL);
    }

    stop() {
        this.log('Stopping proxy manager...');
        this.isRunning = false;
    }

    getProxy() {
        return this.getNextProxy();
    }
}

// Export the manager for use with the service controller
module.exports = new ProxyManager();

// If running directly, start the manager
if (require.main === module) {
    const manager = module.exports;
    manager.start();

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
        manager.stop();
        process.exit(0);
    });

process.on('SIGINT', () => {
       manager.stop();
       process.exit(0);
   });

   // Handle uncaught errors
   process.on('uncaughtException', (error) => {
       manager.log(`Uncaught error: ${error.message}`);
       manager.stop();
       process.exit(1); 
   });

   // Handle unhandled promise rejections
   process.on('unhandledRejection', (reason, promise) => {
       manager.log(`Unhandled rejection: ${reason}`);
       manager.stop();
       process.exit(1);
   });
}
