import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Extend globalThis for the singleton across hot-reloads in dev
const globalForPrisma = globalThis as unknown as {
  _prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error('CRITICAL: DATABASE_URL environment variable is missing!');
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // Serverless-optimized pool settings for Vercel
    max: 5,              // Limit max connections (serverless functions share a small pool)
    idleTimeoutMillis: 10000,  // Close idle connections quickly
    connectionTimeoutMillis: 10000, // Don't wait too long for a connection
  });

  // Gracefully handle pool errors to prevent unhandled rejections
  pool.on('error', (err) => {
    console.error('[PRISMA] Unexpected pool error:', err.message);
  });

  type PrismaPgArgs = ConstructorParameters<typeof PrismaPg>[0];
  const adapter = new PrismaPg(pool as unknown as PrismaPgArgs);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

/**
 * Returns the singleton PrismaClient, creating it on first call.
 * Safe to call at build time — will only throw when actually invoked
 * (not when the module is imported).
 */
function getPrisma(): PrismaClient {
  if (!globalForPrisma._prisma) {
    globalForPrisma._prisma = createPrismaClient();
  }
  return globalForPrisma._prisma;
}

/**
 * Lazy-initialised Prisma client.
 *
 * Exported as a Proxy so that the underlying PrismaClient is only created
 * when a property is first accessed at runtime — NOT when the module is
 * evaluated during Next.js build / page-data collection.
 *
 * All existing call-sites (`prisma.user.findMany(…)` etc.) keep working
 * without any changes.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrisma(), prop, receiver);
  },
});

export default prisma;