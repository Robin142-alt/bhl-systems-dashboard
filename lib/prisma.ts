import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// 1. Setup the connection pool using your Neon URL from .env
const pool = new pg.Pool({ 
  connectionString: process.env.DATABASE_URL 
});

// 2. ROOT CAUSE ANALYSIS: Define the specific type the adapter expects 
// This replaces 'as any' and stops the ESLint error.
type PrismaPgArgs = ConstructorParameters<typeof PrismaPg>[0];
const adapter = new PrismaPg(pool as unknown as PrismaPgArgs); 

// 3. Singleton pattern: Prevents your app from opening too many 
// database connections during local development (npm run dev)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ 
    adapter 
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Exporting both named and default for maximum compatibility
export default prisma;