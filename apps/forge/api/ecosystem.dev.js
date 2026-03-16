module.exports = {
  apps: [
    {
      name: 'orchestrator-api',
      cwd: './apps/api',
      script: 'src/main.ts',
      interpreter: 'ts-node',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        API_PORT: 9000
      },
      env_file: '../../.env',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_file: './logs/api-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024'
    }
  ]
};
