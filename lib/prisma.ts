import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// Singleton pattern to prevent multiple instances during hot-reload in dev
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error('CRITICAL: DATABASE_URL environment variable is missing!');
  }

  // Use the standard pg Pool — works in both local Node.js AND Vercel (serverless Node runtime)
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Allow self-signed certs on Neon's SSL endpoint
    ssl: { rejectUnauthorized: false },
  });

  type PrismaPgArgs = ConstructorParameters<typeof PrismaPg>[0];
  const adapter = new PrismaPg(pool as unknown as PrismaPgArgs);

  return new PrismaClient({ adapter });
}

// Lazy getter — the client is created only when `prisma` is first accessed at
// runtime, NOT when the module is imported during Next.js build / page collection.
function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Re-export as a Proxy so that any property access triggers lazy init
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as Record<string | symbol, unknown>)[prop];
  },
});

export default prisma;