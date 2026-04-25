# BHL Management System
Kenyan compliance + operations execution system with task ownership, proof enforcement, approvals, WhatsApp reminders, and a document registry (OCR + verification).

## Local Development
- Install: `npm install`
- Env: copy `.env.example` to `.env`
- Database: `npm run db:push`
- Run: `npm run dev`

## Deployment (Vercel + Neon)
1. Create a Neon Postgres database.
2. Set Vercel env vars (minimum):
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL`
   - `CRON_SECRET`
   - `WHATSAPP_INTAKE_SECRET`
3. If production was created with `prisma db push`:
   - Baseline it once: run `npm run db:baseline` locally with `DATABASE_URL` set to the production **direct (non-pooled)** connection string.
4. Apply schema migrations to the production DB:
   - Run `npm run db:deploy` locally (again using the direct/non-pooled string).
4. Optional: enable private document registry storage on Vercel Blob:
   - `DOCUMENT_STORAGE_MODE=VERCEL_BLOB`
   - `BLOB_READ_WRITE_TOKEN`
5. Deploy. Cron jobs are configured in `vercel.json`.

## Health Check
- Public: `GET /api/health` returns basic status.
- Authorized: add `Authorization: Bearer <CRON_SECRET>` to include DB connectivity and deployment hints.

## Key Files
- `prisma/schema.prisma` database schema
- `app/actions.ts` server actions (workflow + operations)
- `lib/document-registry.ts` document registry + OCR/extraction
- `lib/work-items.ts` unified WorkItem core + legacy backfill bridge
- `lib/whatsapp-reminders.ts` WhatsApp reminders/digests + retry pipeline
