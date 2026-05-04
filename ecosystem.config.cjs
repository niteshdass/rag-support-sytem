module.exports = {
  apps: [
    {
      name: 'api',
      script: 'node_modules/.bin/tsx',
      args: 'watch src/index.ts',
      interpreter: process.env.NODE_OVERRIDE || process.execPath,
      env: {
        NODE_ENV: 'development',
      },
      watch: false, // tsx handles watching
      error_file: 'logs/api-error.log',
      out_file: 'logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },

    // Uncomment when worker (Agenda) is implemented:
    // {
    //   name: 'worker',
    //   script: 'node_modules/.bin/tsx',
    //   args: 'watch src/worker.ts',
    //   env: { NODE_ENV: 'development' },
    //   error_file: 'logs/worker-error.log',
    //   out_file: 'logs/worker-out.log',
    // },

    // Uncomment when web dashboard is scaffolded:
    // {
    //   name: 'web',
    //   cwd: './web',
    //   script: 'node_modules/.bin/vite',
    //   args: '--port 5173',
    //   env: { NODE_ENV: 'development' },
    //   error_file: '../logs/web-error.log',
    //   out_file: '../logs/web-out.log',
    // },

    // Uncomment after placing the qdrant binary at ./bin/qdrant:
    // {
    //   name: 'qdrant',
    //   script: './bin/qdrant',
    //   interpreter: 'none',
    //   error_file: 'logs/qdrant-error.log',
    //   out_file: 'logs/qdrant-out.log',
    // },

    // Uncomment after placing the meilisearch binary at ./bin/meilisearch:
    // {
    //   name: 'meilisearch',
    //   script: './bin/meilisearch',
    //   interpreter: 'none',
    //   args: '--env development',
    //   error_file: 'logs/meilisearch-error.log',
    //   out_file: 'logs/meilisearch-out.log',
    // },
  ],
};
