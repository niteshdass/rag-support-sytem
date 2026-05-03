import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { organizations, apiKeys } from '../db/schema.js';
import { generateApiKey } from '../services/auth.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';

const createOrgBody = z.object({
  name: z.string().min(1).max(255),
  keyName: z.string().min(1).max(255).default('default'),
});

const addKeyBody = z.object({
  name: z.string().min(1).max(255),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // BOOTSTRAP ONLY — this endpoint has no auth. Add auth protection before going to production.
  app.post('/api/admin/orgs', async (request, reply) => {
    const parsed = createOrgBody.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.errors);
    }

    const { name, keyName } = parsed.data;
    const { key, prefix, hash } = generateApiKey();

    const [org] = await db.insert(organizations).values({ name }).returning();

    if (!org) {
      throw new Error('Failed to create organization');
    }

    await db.insert(apiKeys).values({
      organizationId: org.id,
      keyHash: hash,
      keyPrefix: prefix,
      name: keyName,
    });

    return reply.status(201).send({
      success: true,
      data: {
        organization: org,
        apiKey: key,
      },
      timestamp: new Date().toISOString(),
    });
  });

  // BOOTSTRAP ONLY — no auth. Add auth protection before going to production.
  app.post('/api/admin/orgs/:orgId/keys', async (request, reply) => {
    const { orgId } = request.params as { orgId: string };
    const parsed = addKeyBody.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid request body', parsed.error.errors);
    }

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) {
      throw new NotFoundError('Organization not found');
    }

    const { key, prefix, hash } = generateApiKey();

    await db.insert(apiKeys).values({
      organizationId: orgId,
      keyHash: hash,
      keyPrefix: prefix,
      name: parsed.data.name,
    });

    return reply.status(201).send({
      success: true,
      data: { apiKey: key },
      timestamp: new Date().toISOString(),
    });
  });
}
