import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

const start = async (): Promise<void> => {
  await app.listen({ port: Number(process.env['API_PORT'] ?? 3000), host: '0.0.0.0' });
};

start().catch((err: unknown) => {
  app.log.error(err);
  process.exit(1);
});
