const fs = require('fs');
const axios = require('axios');
const path = require('path');

class ProxyManager {
    constructor(instanceId = path.basename(process.cwd())) {
        this.instanceId = instanceId;
        this.workingProxies = new Map();
        this.isRunning = false;
        this.pidFile = `/tmp/proxy-manager-${this.instanceId}.pid`;
        this.proxyFile = path.join(process.cwd(), 'proxy.txt');
        this.logDir = path.join(process.cwd(), 'logs');
        this.logFile = path.join(this.logDir, 'proxy_manager.log');
        this.setupPid();
        this.setupLogDir();
        this.loadExistingProxies();
        
        // تنظیمات تایم‌اوت و تعداد تلاش‌ها
        this.timeout = 5000;  // 5 seconds timeout
        this.retries = 2;     // تعداد تلاش برای هر پروکسی
    }

    setupPid() {
        fs.writeFileSync(this.pidFile, process.pid.toString());
        process.on('exit', () => {
            if (fs.existsSync(this.pidFile)) {
                fs.unlinkSync(this.pidFile);
            }
        });
    }

    setupLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}][Instance ${this.instanceId}] ${message}\n`;
        console.log(message);
        fs.appendFileSync(this.logFile, logMessage);
    }

    loadExistingProxies() {
        try {
            if (fs.existsSync(this.proxyFile)) {
                const content = fs.readFileSync(this.proxyFile, 'utf8');
                content.split('\n')
                    .map(line => line.trim())
                    .filter(line => this.isValidProxyFormat(line))
                    .forEach(proxy => {
                        this.workingProxies.set(proxy, Date.now());
                    });
                this.log(`Loaded ${this.workingProxies.size} existing proxies`);
            }
        } catch (error) {
            this.log(`Error loading proxies: ${error.message}`);
            fs.writeFileSync(this.proxyFile, '');
        }
    }

    isValidProxyFormat(proxy) {
        if (!proxy || !proxy.includes(':')) return false;
        const [host, port] = proxy.split(':');
        const portNum = parseInt(port);
        return (
            host && 
            host.match(/^(\d{1,3}\.){3}\d{1,3}$/) &&
            !isNaN(portNum) && 
            portNum >= 1 && 
            portNum <= 65535
        );
    }

    async verifyProxy(proxy, testUrls = ['http://example.com', 'https://api.ipify.org']) {
        const [host, port] = proxy.split(':');
        
        for (let attempt = 0; attempt < this.retries; attempt++) {
            for (const url of testUrls) {
                try {
                    const response = await axios.get(url, {
                        proxy: {
                            host,
                            port: parseInt(port),
                            protocol: 'http'
                        },
                        timeout: this.timeout,
                        validateStatus: status => status >= 200 && status < 300
                    });
                    
                    if (response.status === 200) {
                        return true;
                    }
                } catch (error) {
                    continue;
                }
            }
        }
        return false;
    }

    async fetchAndCheckProxies() {
        this.log('Starting full proxy fetch and check...');
        const sources = [
            'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
            'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
            'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
            'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt'
        ];
        
        const newProxies = new Set();
        
        for (const url of sources) {
            try {
                const response = await axios.get(url, { timeout: 10000 });
                response.data.split('\n')
                    .map(line => line.trim())
                    .filter(line => this.isValidProxyFormat(line))
                    .forEach(proxy => newProxies.add(proxy));
            } catch (error) {
                this.log(`Failed to fetch from ${url}: ${error.message}`);
            }
        }

        const batches = Array.from(newProxies)
            .filter(proxy => !this.workingProxies.has(proxy));

        let verifiedCount = 0;
        for (let i = 0; i < batches.length; i += 50) {
            const batch = batches.slice(i, i + 50);
            await Promise.all(batch.map(async proxy => {
                if (await this.verifyProxy(proxy)) {
                    this.workingProxies.set(proxy, Date.now());
                    verifiedCount++;
                    if (verifiedCount % 10 === 0) {
                        this.saveProxies();  // Save every 10 verified proxies
                    }
                }
            }));
        }

        this.log(`Verified ${verifiedCount} new working proxies`);
        this.saveProxies();
    }

    async dailyCheck() {
        this.log('Starting daily check...');
        const proxies = Array.from(this.workingProxies.keys());
        let removedCount = 0;

        for (let i = 0; i < proxies.length; i += 50) {
            const batch = proxies.slice(i, i + 50);
            await Promise.all(batch.map(async proxy => {
                if (!await this.verifyProxy(proxy)) {
                    this.workingProxies.delete(proxy);
                    removedCount++;
                }
            }));
        }

        this.log(`Removed ${removedCount} non-working proxies`);
        this.saveProxies();
    }

    saveProxies() {
        const proxyList = Array.from(this.workingProxies.keys()).join('\n');
        fs.writeFileSync(this.proxyFile, proxyList);
        this.log(`Saved ${this.workingProxies.size} proxies to file`);
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.log('Starting proxy manager...');

        await this.fetchAndCheckProxies();

        // Check for new proxies every 2 hours
        setInterval(async () => {
            if (this.isRunning) {
                await this.fetchAndCheckProxies();
            }
        }, 7200000);

        // Verify existing proxies every 12 hours
        setInterval(async () => {
            if (this.isRunning) {
                await this.dailyCheck();
            }
        }, 43200000);
    }

    stop() {
        this.isRunning = false;
        this.log('Stopping proxy manager...');
        if (fs.existsSync(this.pidFile)) {
            fs.unlinkSync(this.pidFile);
        }
    }
}

if (require.main === module) {
    const manager = new ProxyManager();
    manager.start();

    process.on('SIGTERM', () => manager.stop());
    process.on('SIGINT', () => manager.stop());
}

module.exports = ProxyManager;
