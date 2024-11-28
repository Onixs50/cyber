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
                    .filter(line => line && line.includes(':'))
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

    async quickCheckProxy(proxy) {
        try {
            const [host, port] = proxy.split(':');
            const response = await axios.get('http://ip-api.com/json', {
                proxy: { host, port, protocol: 'http' },
                timeout: 5000
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }

    async fetchAndCheckProxies() {
        this.log('Starting full proxy fetch and check...');
        const sources = [
            'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
            'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt',
            'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt'
        ];
        
        const newProxies = new Set();
        
        for (const url of sources) {
            try {
                const response = await axios.get(url);
                response.data.split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#'))
                    .map(line => line.split(':').slice(0, 2).join(':'))
                    .forEach(proxy => newProxies.add(proxy));
            } catch (error) {
                this.log(`Failed to fetch from ${url}`);
            }
        }

        const batches = Array.from(newProxies)
            .filter(proxy => !this.workingProxies.has(proxy));

        for (let i = 0; i < batches.length; i += 200) {
            const batch = batches.slice(i, i + 200);
            await Promise.all(batch.map(async proxy => {
                if (await this.quickCheckProxy(proxy)) {
                    this.workingProxies.set(proxy, Date.now());
                    this.saveProxies();
                }
            }));
        }
    }

    async dailyCheck() {
        this.log('Starting daily check...');
        const proxies = Array.from(this.workingProxies.keys());

        for (let i = 0; i < proxies.length; i += 200) {
            const batch = proxies.slice(i, i + 200);
            await Promise.all(batch.map(async proxy => {
                if (!await this.quickCheckProxy(proxy)) {
                    this.workingProxies.delete(proxy);
                }
            }));
        }
        this.saveProxies();
    }

    saveProxies() {
        const proxyList = Array.from(this.workingProxies.keys()).join('\n');
        fs.writeFileSync(this.proxyFile, proxyList);
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.log('Starting proxy manager...');

        await this.fetchAndCheckProxies();

        setInterval(async () => {
            if (this.isRunning) {
                await this.fetchAndCheckProxies();
            }
        }, 7800000);

        setInterval(async () => {
            if (this.isRunning) {
                await this.dailyCheck();
            }
        }, 86400000);
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
