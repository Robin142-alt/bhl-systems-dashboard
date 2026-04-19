import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

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

// Singleton pattern to prevent multiple instances during hot-reload in dev
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;