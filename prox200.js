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
    CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes
    REFRESH_INTERVAL: 2 * 60 * 60 * 1000, // 2 hours
    MIN_PROXIES: 200, // Minimum number of proxies to maintain
    TIMEOUT: 5000 // 5 seconds timeout for proxy checking
};

class ProxyManager {
    constructor() {
        this.workingProxies = new Map(); // Map to store proxies with their last check timestamp
        this.isRunning = false;
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
                    const cleanProxy = proxy.split('::')[0]; // Remove empty username:password
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

    async checkProxy(proxy) {
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

            await axios.get('http://example.com', proxyConfig);
            return true;
        } catch {
            return false;
        }
    }

    async fetchProxies() {
        let newProxies = [];
        
        for (const source of CONFIG.PROXY_SOURCES) {
            try {
                this.log(`Fetching ${source.type} proxies...`);
                const response = await axios.get(source.url);
                const proxyList = response.data.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'))
                    .map(line => line.split(':').slice(0, 2).join(':'));
                
                newProxies.push(...proxyList);
                this.log(`✅ Added ${proxyList.length} ${source.type} proxies to check`);
            } catch (error) {
                this.log(`❌ Failed to fetch ${source.type} proxies: ${error.message}`);
            }
        }
        return newProxies;
    }

    async verifyAndUpdateProxies() {
        if (!this.isRunning) return;

        // Check existing proxies first
        const existingProxies = Array.from(this.workingProxies.keys());
        this.log(`Checking ${existingProxies.length} existing proxies...`);
        
        for (const proxy of existingProxies) {
            if (!this.isRunning) return;
            
            if (!(await this.checkProxy(proxy))) {
                this.workingProxies.delete(proxy);
                this.log(`❌ Removed non-working proxy: ${proxy}`);
                
                // Replace the non-working proxy immediately
                await this.addNewWorkingProxy();
            } else {
                // Update timestamp for working proxy
                this.workingProxies.set(proxy, Date.now());
            }
        }

        // If we still need more proxies, add them
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
        const proxyList = Array.from(this.workingProxies.keys())
            .map(proxy => `${proxy}::`); // Add empty username:password
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

        // Initial check and population
        await this.verifyAndUpdateProxies();

        // Schedule regular checks
        setInterval(async () => {
            if (this.isRunning) {
                await this.verifyAndUpdateProxies();
            }
        }, CONFIG.REFRESH_INTERVAL);
    }

    stop() {
        this.log('Stopping proxy manager...');
        this.isRunning = false;
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
}
