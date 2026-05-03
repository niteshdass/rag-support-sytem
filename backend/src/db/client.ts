import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env.js';
import { config } from '../config.js';
import * as schema from './schema.js';

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: config.dbPoolSize,
});

export const db = drizzle(pool, { schema });
export { pool };

export type Db = typeof db;
