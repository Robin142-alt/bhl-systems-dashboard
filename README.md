🛡️ BHL Systems Dashboard
Getting Started
Clone: git clone <repo-url>

Install: npm install

Env: Copy .env.example to .env and add your local DB URL.

Database: Run npm run db:setup.

Launch: npm run dev.

Project Structure
/app/actions.ts: All Server Actions (Business Logic).

/prisma/schema.prisma: The "Source of Truth" for the database.

/components: Reusable UI elements (AttendanceList, etc.).