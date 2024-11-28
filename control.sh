#!/bin/bash

SERVICE_NAME="proxy-manager"
SCRIPT_PATH="$(pwd)/prox.js"
INSTANCE_ID=$(basename $(pwd))
PID_FILE="/tmp/proxy-manager-${INSTANCE_ID}.pid"
BOT_PID_FILE="/tmp/airdrop-bot-${INSTANCE_ID}.pid"
LOG_DIR="$(pwd)/logs"

mkdir -p $LOG_DIR

check_status() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo "Proxy manager (Instance: ${INSTANCE_ID}) is running (PID: $pid)"
            return 0
        else
            rm "$PID_FILE"
        fi
    fi
    echo "Proxy manager (Instance: ${INSTANCE_ID}) is not running"
    return 1
}

check_bot_status() {
    if [ -f "$BOT_PID_FILE" ]; then
        pid=$(cat "$BOT_PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo "Bot (Instance: ${INSTANCE_ID}) is running (PID: $pid)"
            return 0
        else
            rm "$BOT_PID_FILE"
        fi
    fi
    echo "Bot (Instance: ${INSTANCE_ID}) is not running"
    return 1
}

start() {
    if check_status > /dev/null; then
        echo "Proxy manager (Instance: ${INSTANCE_ID}) is already running"
        exit 1
    fi
    echo "Starting proxy manager (Instance: ${INSTANCE_ID})..."
    chmod +x "$SCRIPT_PATH"
    nohup /usr/bin/node "$SCRIPT_PATH" >> "$LOG_DIR/proxy_manager.log" 2>&1 &
    sleep 2
    if check_status > /dev/null; then
        echo "Proxy manager (Instance: ${INSTANCE_ID}) started successfully"
    else
        echo "Failed to start proxy manager (Instance: ${INSTANCE_ID})"
        exit 1
    fi
}

rstart() {
    if check_bot_status > /dev/null; then
        echo "Bot (Instance: ${INSTANCE_ID}) is already running"
        exit 1
    fi
    echo "Starting bot (Instance: ${INSTANCE_ID})..."
    
    exec 3>&1
    BOT_PID=$( ({ npm start | while read -r line; do
        echo "$line" | tee -a "$LOG_DIR/bot.log"
        if echo "$line" | grep -q "like to use proxies"; then
            echo "y" >&0
        elif echo "$line" | grep -q "How many accounts"; then
            echo -e "\n" >&0
        fi
    done } | tee /dev/fd/3) 0<&1 & echo $! )
    exec 3>&-
    
    echo $BOT_PID > "$BOT_PID_FILE"
    sleep 5
    
    if check_bot_status > /dev/null; then
        echo "Bot (Instance: ${INSTANCE_ID}) started successfully"
    else
        echo "Failed to start bot (Instance: ${INSTANCE_ID})"
        exit 1
    fi
}

stop() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        echo "Stopping proxy manager (Instance: ${INSTANCE_ID}, PID: $pid)..."
        kill "$pid"
        rm "$PID_FILE"
        echo "Proxy manager (Instance: ${INSTANCE_ID}) stopped"
    else
        echo "Proxy manager (Instance: ${INSTANCE_ID}) is not running"
    fi
}

rstop() {
    if [ -f "$BOT_PID_FILE" ]; then
        pid=$(cat "$BOT_PID_FILE")
        echo "Stopping bot (Instance: ${INSTANCE_ID}, PID: $pid)..."
        kill -9 "$pid"
        rm "$BOT_PID_FILE"
        echo "Bot (Instance: ${INSTANCE_ID}) stopped"
    else
        echo "Bot (Instance: ${INSTANCE_ID}) is not running"
    fi
}

restart() {
    stop
    sleep 2
    start
}

rrestart() {
    rstop
    sleep 2
    rstart
}

logs() {
    if [ -f "$LOG_DIR/proxy_manager.log" ]; then
        tail -n 50 "$LOG_DIR/proxy_manager.log"
    else
        echo "No proxy log file found for instance ${INSTANCE_ID}"
    fi
}

rlogs() {
    if [ -f "$LOG_DIR/bot.log" ]; then
        tail -n 50 "$LOG_DIR/bot.log"
    else
        echo "No bot log file found for instance ${INSTANCE_ID}"
    fi
}

live_logs() {
    if [ -f "$LOG_DIR/proxy_manager.log" ]; then
        tail -f "$LOG_DIR/proxy_manager.log"
    else
        echo "No proxy log file found for instance ${INSTANCE_ID}"
    fi
}

rlive() {
    if [ -f "$LOG_DIR/bot.log" ]; then
        tail -f "$LOG_DIR/bot.log"
    else
        echo "No bot log file found for instance ${INSTANCE_ID}"
    fi
}

case "$1" in
    start)
        start
        ;;
    rstart)
        rstart
        ;;
    stop)
        stop
        ;;
    rstop)
        rstop
        ;;
    restart)
        restart
        ;;
    rrestart)
        rrestart
        ;;
    status)
        check_status
        check_bot_status
        ;;
    logs)
        logs
        ;;
    rlogs)
        rlogs
        ;;
    live)
        live_logs
        ;;
    rlive)
        rlive
        ;;
    *)
        echo "Usage: $0 {start|rstart|stop|rstop|restart|rrestart|status|logs|rlogs|live|rlive}"
        exit 1
        ;;
esac

exit 0
exit 0
