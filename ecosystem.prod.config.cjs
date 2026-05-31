module.exports = {
  apps: [
    {
      name: 'qdrant',
      script: './qdrant',
      interpreter: 'none',
      env: {
        QDRANT__SERVICE__HOST: '127.0.0.1',
        QDRANT__SERVICE__API_KEY: process.env.QDRANT_API_KEY,
      },
      error_file: 'logs/qdrant-error.log',
      out_file: 'logs/qdrant-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'meilisearch',
      script: './meilisearch',
      interpreter: 'none',
      args: '--env production --db-path ./data.ms --http-addr 127.0.0.1:7700',
      env: {
        MEILI_MASTER_KEY: process.env.MEILI_MASTER_KEY,
      },
      error_file: 'logs/meilisearch-error.log',
      out_file: 'logs/meilisearch-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'api',
      script: 'dist/index.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      error_file: 'logs/api-error.log',
      out_file: 'logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
