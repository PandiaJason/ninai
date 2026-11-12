module.exports = {
  apps: [
    {
      name: 'ninai-api',
      script: 'server/index.js',
      cwd: 'C:\\ninai',
      interpreter: 'node',
      interpreter_args: '',
      env_file: '.env',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      out_file: 'logs/ninai-api-out.log',
      error_file: 'logs/ninai-api-error.log',
      merge_logs: true,
    },
  ],
};
