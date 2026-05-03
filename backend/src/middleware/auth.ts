import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db/client.js';
import { validateApiKey } from '../services/auth.js';
import { UnauthorizedError } from '../utils/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    organizationId: string;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError();
  }

  const rawKey = authHeader.slice(7);
  const result = await validateApiKey(rawKey, db);

  if (result === null) {
    throw new UnauthorizedError();
  }

  request.organizationId = result.organizationId;
}
