import MongoStore from 'connect-mongo';
import express from 'express';
import session from 'express-session';
import { errorHandler } from './api/middleware/errorHandler.js';
import { adminRouter } from './api/routes/admin/index.js';
import { authRouter } from './api/routes/auth.js';
import { chatRouter } from './api/routes/chat.js';
import { copilotRouter } from './api/routes/copilot.js';
import { queryRouter } from './api/routes/query.js';
import { zendeskWebhookRouter } from './api/routes/webhooks/zendesk.js';
import { env } from './config/env.js';
import { connect, disconnect } from './infra/mongo/client.js';
import { startWorker, stopWorker } from './jobs/index.js';
import {
  startAllEmailListeners,
  stopAllEmailListeners,
} from './channels/email/channel.js';
import { logger } from './observability/logger.js';

const app = express();

// Behind a TLS-terminating proxy (Render/Fly/Vercel rewrite) in production.
// Required so `secure` session cookies are set and req.protocol reflects X-Forwarded-Proto.
if (env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(express.json());

app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: env.MONGODB_URI }),
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/chat', chatRouter);
app.use('/copilot', copilotRouter);
app.use('/query', queryRouter);
app.use('/webhooks/zendesk', zendeskWebhookRouter);

app.use(errorHandler);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  await stopAllEmailListeners();
  await stopWorker();
  await disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

await connect();
await startWorker();
await startAllEmailListeners();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'SupportPilot API started');
});

export default app;
