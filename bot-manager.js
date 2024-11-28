const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class BotManager {
    constructor() {
        this.instanceId = path.basename(process.cwd());
        this.pidFile = `/tmp/airdrop-bot-${this.instanceId}.pid`;
        this.logDir = path.join(process.cwd(), 'logs');
        this.logFile = path.join(this.logDir, 'bot.log');
        this.process = null;
        this.lastLogTime = Date.now();
        this.setupLogDir();
    }

    setupLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}][Bot ${this.instanceId}] ${message}\n`;
        fs.appendFileSync(this.logFile, logMessage);
        this.lastLogTime = Date.now();
    }

    start() {
        if (this.process) {
            this.log('Bot is already running');
            return;
        }

        this.process = spawn('npm', ['start'], {
            cwd: process.cwd(),
            stdio: 'pipe',
            shell: true
        });

        fs.writeFileSync(this.pidFile, this.process.pid.toString());
        this.log(`Started bot with PID: ${this.process.pid}`);

        this.process.stdout.on('data', (data) => {
            this.log(data.toString());
        });

        this.process.stderr.on('data', (data) => {
            this.log(`Error: ${data}`);
        });

        this.process.on('close', (code) => {
            this.log(`Bot process exited with code ${code}`);
            this.cleanup();
            setTimeout(() => this.start(), 5000); // Restart after 5 seconds
        });

        this.startMonitoring();
    }

    startMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }

        this.monitorInterval = setInterval(() => {
            const timeSinceLastLog = Date.now() - this.lastLogTime;
            if (timeSinceLastLog > 5 * 60 * 1000) { // 5 minutes without logs
                this.log('Bot appears to be stuck - restarting...');
                this.restart();
            }
        }, 60 * 1000); // Check every minute
    }

    cleanup() {
        if (fs.existsSync(this.pidFile)) {
            fs.unlinkSync(this.pidFile);
        }
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }
        this.process = null;
    }

    restart() {
        this.stop();
        setTimeout(() => this.start(), 5000);
    }

    stop() {
        if (this.process) {
            this.process.kill();
            this.cleanup();
            this.log('Bot stopped');
        }
    }
}

module.exports = BotManager;

if (require.main === module) {
    const bot = new BotManager();
    const command = process.argv[2];

    if (command === 'start') {
        bot.start();
    } else if (command === 'stop') {
        bot.stop();
    } else if (command === 'restart') {
        bot.restart();
    }

    process.on('SIGTERM', () => {
        bot.stop();
        process.exit(0);
    });

    process.on('SIGINT', () => {
        bot.stop();
        process.exit(0);
    });
}
