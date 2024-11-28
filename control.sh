#!/bin/bash

SERVICE_NAME="proxy-manager"
SCRIPT_PATH="$(pwd)/prox.js"
INSTANCE_ID=$(basename $(pwd))
PID_FILE="/tmp/proxy-manager-${INSTANCE_ID}.pid"
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

restart() {
    stop
    sleep 2
    start
}

logs() {
    if [ -f "$LOG_DIR/proxy_manager.log" ]; then
        tail -n 50 "$LOG_DIR/proxy_manager.log"
    else
        echo "No log file found for instance ${INSTANCE_ID}"
    fi
}

live_logs() {
    if [ -f "$LOG_DIR/proxy_manager.log" ]; then
        tail -f "$LOG_DIR/proxy_manager.log"
    else
        echo "No log file found for instance ${INSTANCE_ID}"
    fi
}

case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        check_status
        ;;
    logs)
        logs
        ;;
    live)
        live_logs
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|live}"
        exit 1
        ;;
esac

exit 0
