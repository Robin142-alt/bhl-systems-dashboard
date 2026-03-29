import { PrismaClient, Role, TrainingStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
type PrismaPgArgs = ConstructorParameters<typeof PrismaPg>[0];
const adapter = new PrismaPg(pool as unknown as PrismaPgArgs);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting the BHL Master Structural Seed...");

  // --- 1. CLEANING ---
  console.log("🧹 Wiping old data...");
  await prisma.operationalExpense.deleteMany({});
  await prisma.certificate.deleteMany({}); // Corrected: lowercase
  await prisma.attendance.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.complianceItem.deleteMany({});
  await prisma.training.deleteMany({});
  await prisma.user.deleteMany({});

  const hashedPassword = bcrypt.hashSync("password123", 10);

  // --- 2. USERS ---
  console.log("👤 Creating Staff Accounts...");
  const admin = await prisma.user.create({
    data: { 
      email: "admin@bhl.com", 
      name: "BHL Admin", // Added name for the certificate view
      password: hashedPassword, 
      role: Role.ADMIN 
    },
  });

  const hr = await prisma.user.create({
    data: { 
      email: "hr@bhl.com", 
      name: "HR Manager",
      password: hashedPassword, 
      role: Role.HR 
    },
  });

  const accountant = await prisma.user.create({
    data: { 
      email: "acc@bhl.com", 
      name: "Lead Accountant",
      password: hashedPassword, 
      role: Role.ADMIN 
    },
  });

  // --- 3. TRAINING ---
  console.log("🎓 Creating Training Session...");
  const safetyTraining = await prisma.training.create({
    data: {
      title: "BHL Safety & Fire Drill 2026",
      description: "Mandatory induction for Ruiru campus staff.",
      startDate: new Date("2026-04-10"),
      endDate: new Date("2026-04-10"),
      location: "Main Boardroom",
      budgetKES: 10000,
      costKES: 8500,
      status: TrainingStatus.SCHEDULED,
      createdById: admin.id, 
    },
  });

  // --- 4. ATTENDANCE ---
  console.log("📋 Recording Attendance...");
  const adminAttendance = await prisma.attendance.create({
    data: {
      userId: admin.id,
      trainingId: safetyTraining.id,
      attended: true, // Removed non-existent staffName/staffEmail
    },
  });

  // --- 5. CERTIFICATES ---
  console.log("📜 Issuing Certificates...");
  await prisma.certificate.create({ // Corrected model name
    data: {
      certificateNo: "BHL-SAF-2026-001",
      attendanceId: adminAttendance.id,
      fileUrl: "/certificates/BHL-SAF-2026-001.pdf"
    },
  });

  // --- 6. OPERATIONAL EXPENSES ---
  console.log("💸 Logging Operational Expenses...");
  await prisma.operationalExpense.createMany({
    data: [
      { category: "Utility", description: "KPLC Tokens - Ruiru Office", amount: 3500.00, createdById: admin.id },
      { category: "Maintenance", description: "Generator Servicing", amount: 12000.00, createdById: admin.id },
      { category: "Subscription", description: "Starlink Internet - Ruiru HQ", amount: 6500.00, createdById: admin.id },
      { category: "Consumables", description: "Office Stationery & Drinking Water", amount: 4200.00, createdById: accountant.id }
    ]
  });

  // --- 7. COMPLIANCE ROADMAP ---
  console.log("📊 Creating Compliance Roadmap...");
  await prisma.complianceItem.createMany({
    data: [
      {
        title: "PAYE Submission",
        deadline: new Date("2026-04-09"),
        frequency: "Monthly",
        responsible: "HR Department", 
        category: "Tax",
        status: "Pending",
        userId: admin.id 
      },
      {
        title: "SHA (Social Health Authority)",
        deadline: new Date("2026-04-09"),
        frequency: "Monthly",
        responsible: "HR Department", 
        category: "Statutory",
        status: "Completed",
        userId: hr.id 
      },
      {
        title: "VAT Filing",
        deadline: new Date("2026-04-20"),
        frequency: "Monthly",
        responsible: "Accountant", 
        category: "Tax",
        status: "Pending",
        userId: accountant.id 
      }
    ],
  });

  console.log("✅ BHL SYSTEM FULLY SEEDED!");
}

main()
  .catch((e) => {
    console.error("❌ Seed Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end(); 
  });