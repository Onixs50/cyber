#!/bin/bash
# control.sh

# Service configuration
SERVICE_NAME="proxy-manager"
SCRIPT_PATH="$(pwd)/prox.js"
PID_FILE="/tmp/proxy-manager.pid"
LOG_DIR="$(pwd)/logs"

# Ensure log directory exists
mkdir -p $LOG_DIR

# Function to check if service is running
check_status() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo "Proxy manager is running (PID: $pid)"
            return 0
        else
            rm "$PID_FILE"
        fi
    fi
    echo "Proxy manager is not running"
    return 1
}

# Start the service
start() {
    if check_status > /dev/null; then
        echo "Proxy manager is already running"
        exit 1
    fi
    
    echo "Starting proxy manager..."
    # Add execute permission to the JS file
    chmod +x "$SCRIPT_PATH"
    # Start the process with full path to node
    nohup /usr/bin/node "$SCRIPT_PATH" >> "$LOG_DIR/proxy_manager.log" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 2
    
    # Verify the process actually started
    if check_status > /dev/null; then
        echo "Proxy manager started successfully"
    else
        echo "Failed to start proxy manager. Check logs for details."
        exit 1
    fi
}

# Stop the service
stop() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        echo "Stopping proxy manager (PID: $pid)..."
        kill "$pid"
        rm "$PID_FILE"
        echo "Proxy manager stopped"
    else
        echo "Proxy manager is not running"
    fi
}

# Restart the service
restart() {
    stop
    sleep 2
    start
}

# Display recent logs
logs() {
    if [ -f "$LOG_DIR/proxy_manager.log" ]; then
        tail -n 50 "$LOG_DIR/proxy_manager.log"
    else
        echo "No log file found"
    fi
}

# Live log viewing
live_logs() {
    if [ -f "$LOG_DIR/proxy_manager.log" ]; then
        tail -f "$LOG_DIR/proxy_manager.log"
    else
        echo "No log file found"
    fi
}

# Command line interface
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
