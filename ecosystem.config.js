module.exports = {
  apps: [
    {
      name: 'simpredict-backend',
      script: 'dist/main.js',
      instances: 'max',       // Spawn one worker per CPU core
      exec_mode: 'cluster',   // Enable cluster mode
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // Graceful restart
      kill_timeout: 5000,
      listen_timeout: 10000,
      wait_ready: false,

      // Logging
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',

      // Auto-restart on failure
      autorestart: true,
      max_restarts: 10,
      restart_delay: 1000,

      // Watch mode (dev only — disable in production)
      watch: false,
    },
  ],
};
