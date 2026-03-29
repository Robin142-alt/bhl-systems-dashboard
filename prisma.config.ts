import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  // 1. Where your models live
  schema: 'prisma/schema.prisma',

  // 2. Where your database lives
  datasource: {
    url: env("DATABASE_URL") ?? "",
  },

  // 3. How to seed your database (Admin user, etc.)
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});