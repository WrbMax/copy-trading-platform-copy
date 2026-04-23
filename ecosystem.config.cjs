module.exports = {
  apps: [{
    name: 'copy-trading',
    script: './dist/index.js',
    cwd: '/www/wwwroot/copy-trading',
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '400M',
    env: {
      NODE_ENV: 'production',
      PORT: '3001',
      DATABASE_URL: 'mysql://copytrader:CopyTrade2024!@localhost:3306/alpharoute',
      JWT_SECRET: 'copy-trading-jwt-secret-2024-xgjdmy-secure',
      VITE_APP_ID: 'copy-trading-app',
      OAUTH_SERVER_URL: 'https://api.manus.im',
      VITE_OAUTH_PORTAL_URL: 'https://manus.im',
      OWNER_OPEN_ID: 'admin',
      OWNER_NAME: 'admin',
      BUILT_IN_FORGE_API_URL: '',
      BUILT_IN_FORGE_API_KEY: '',
      VITE_FRONTEND_FORGE_API_KEY: '',
      VITE_FRONTEND_FORGE_API_URL: '',
      VITE_ANALYTICS_ENDPOINT: '',
      VITE_ANALYTICS_WEBSITE_ID: ''
    },
    error_file: '/www/wwwroot/copy-trading/logs/error.log',
    out_file: '/www/wwwroot/copy-trading/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
