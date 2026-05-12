module.exports = {
  apps: [
    {
      name: 'api',
      script: 'node_modules/.bin/tsx',
      args: 'watch src/index.ts',
      interpreter: process.env.NODE_OVERRIDE || 'node',
      env: {
        NODE_ENV: 'development',
      },
      watch: false, // tsx handles watching
      error_file: 'logs/api-error.log',
      out_file: 'logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    {
      name: 'web',
      cwd: './web',
      script: 'node_modules/.bin/vite',
      args: '--port 5173',
      interpreter: process.env.NODE_OVERRIDE || 'node',
      env: { NODE_ENV: 'development' },
      error_file: '../logs/web-error.log',
      out_file: '../logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    {
      name: 'qdrant',
      script: './qdrant',
      interpreter: 'none',
      error_file: 'logs/qdrant-error.log',
      out_file: 'logs/qdrant-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    {
      name: 'meilisearch',
      script: './meilisearch',
      interpreter: 'none',
      args: '--env development --db-path ./data.ms --http-addr 127.0.0.1:7700',
      error_file: 'logs/meilisearch-error.log',
      out_file: 'logs/meilisearch-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
