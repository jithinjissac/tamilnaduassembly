module.exports = {
  apps: [{
    name: 'kerala-voter-slip',
    script: 'server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      USE_PROTECTED: 'true'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    // Restart on errors
    min_uptime: '10s',
    max_restarts: 10,
    // Auto-restart on crashes
    restart_delay: 4000,
    // Kill timeout
    kill_timeout: 5000,
    // Listen timeout
    listen_timeout: 3000,
    // Shutdown with message
    shutdown_with_message: true,
    // Auto restart on specific exit codes
    autorestart: true,
    // Restart on file changes (disabled for production)
    watch: false,
    // Ignore watch patterns
    ignore_watch: ['node_modules', 'logs', 'public', 'frontend', 'frontend-protected'],
    // Cluster mode options
    exec_mode: 'fork',
    // Advanced features
    merge_logs: true,
    // Exponential backoff restart delay
    exp_backoff_restart_delay: 100,
    // Force restart after crashes
    force: true
  }]
};
