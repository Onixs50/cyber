// prox.js
const fs = require('fs');
const axios = require('axios');
const { exec } = require('child_process');
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
    MAX_PROXIES: 50,
    TIMEOUT: 5000 // 5 seconds timeout for proxy checking
};

class ProxyManager {
    constructor() {
        this.workingProxies = new Set();
        this.isRunning = false;
        this.setupLogDir();
        // Clear proxy file on startup
        this.clearProxyFile();
    }

    clearProxyFile() {
        try {
            fs.writeFileSync(CONFIG.PROXY_FILE, '');
            this.log('Cleared proxy file on startup');
        } catch (error) {
            this.log(`Error clearing proxy file: ${error.message}`);
        }
    }

    setupLogDir() {
        const logDir = 'logs';
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir);
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

        // Start fresh each time
        this.workingProxies.clear();
        
        // Fetch and check new proxies
        this.log('Fetching and checking new proxies...');
        const newProxies = await this.fetchProxies();
        
        for (const proxy of newProxies) {
            if (!this.isRunning) return;
            if (this.workingProxies.size >= CONFIG.MAX_PROXIES) break;
            
            if (await this.checkProxy(proxy)) {
                this.workingProxies.add(proxy);
                // Save immediately when a working proxy is found
                this.saveProxies();
            }
        }

        this.log(`Current working proxies: ${this.workingProxies.size}`);
    }

    saveProxies() {
        const proxyList = Array.from(this.workingProxies)
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
        
        // Clear file and working proxies on start
        this.clearProxyFile();
        this.workingProxies.clear();

        const runChecks = async () => {
            if (!this.isRunning) return;
            await this.verifyAndUpdateProxies();
            if (this.isRunning) {
                setTimeout(runChecks, CONFIG.CHECK_INTERVAL);
            }
        };

        runChecks();
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
