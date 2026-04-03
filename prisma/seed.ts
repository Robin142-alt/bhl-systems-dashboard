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

  // --- 1. CLEANING (Order matters: Delete children before parents) ---
  console.log("🧹 Wiping old data...");
  // Clear optional/new modules first to prevent foreign key constraint errors
  try { await prisma.certificate.deleteMany({}); } catch (e) {}
  try { await prisma.attendance.deleteMany({}); } catch (e) {}
  try { await prisma.operationalExpense.deleteMany({}); } catch (e) {}
  try { await prisma.complianceItem.deleteMany({}); } catch (e) {}
  try { await prisma.training.deleteMany({}); } catch (e) {}
  try { await prisma.vendor.deleteMany({}); } catch (e) {}
  try { await prisma.user.deleteMany({}); } catch (e) {}

  const hashedPassword = bcrypt.hashSync("password123", 10);

  // --- 2. USERS & ROLES ---
  console.log("👤 Creating BHL Staff Accounts...");
  const admin = await prisma.user.create({
    data: { email: "admin@bhl.com", name: "System Admin", password: hashedPassword, role: Role.ADMIN },
  });

  const hr = await prisma.user.create({
    data: { email: "hr@bhl.com", name: "HR Manager", password: hashedPassword, role: Role.USER }, // Adjust enum if you added Role.HR
  });

  const accountant = await prisma.user.create({
    data: { email: "finance@bhl.com", name: "Lead Accountant", password: hashedPassword, role: Role.ADMIN },
  });

  const opsManager = await prisma.user.create({
    data: { email: "ops@bhl.com", name: "Operations Manager", password: hashedPassword, role: Role.USER },
  });

  // --- 3. TRAINING & CPD MODULE ---
  console.log("🎓 Creating Q2 Training Sessions...");
  const cpdTraining = await prisma.training.create({
    data: {
      title: "Q2 Compliance & CPD Training 2026",
      description: "Mandatory Q2 training for NCA and ICT compliance.",
      startDate: new Date("2026-05-15"),
      endDate: new Date("2026-05-16"),
      location: "Ruiru Main Boardroom",
      budgetKES: 5000,   // As per your system requirements
      costKES: 4500,
      status: TrainingStatus.SCHEDULED,
      createdById: hr.id, 
    },
  });

  // --- 4. ATTENDANCE & CERTIFICATES ---
  console.log("📋 Issuing NCA/CPD Certificates...");
  const opsAttendance = await prisma.attendance.create({
    data: {
      userId: opsManager.id,
      trainingId: cpdTraining.id,
      attended: true,
    },
  });

  await prisma.certificate.create({
    data: {
      certificateNo: "BHL-CPD-2026-001",
      attendanceId: opsAttendance.id,
      fileUrl: "/certificates/BHL-CPD-2026-001.pdf"
    },
  });

  // --- 5. OPERATIONAL EXPENSES & VENDORS ---
  console.log("💸 Logging Office Administration Expenses...");
  await prisma.operationalExpense.createMany({
    data: [
      { category: "Utility", description: "KPLC Electricity - Ruiru HQ", amount: 4500.00, createdById: opsManager.id },
      { category: "Subscription", description: "Starlink Monthly Internet", amount: 6500.00, createdById: admin.id },
      { category: "Subscription", description: "Microsoft 365 & Google Drive", amount: 15000.00, createdById: admin.id },
      { category: "Consumables", description: "Office Cleaning & Toiletries", amount: 3200.00, createdById: opsManager.id },
      { category: "Maintenance", description: "Vehicle Maintenance Log", amount: 12500.00, createdById: opsManager.id }
    ]
  });

  // --- 6. COMPLIANCE ROADMAP (The Core Module) ---
  console.log("📊 Creating Statutory & Compliance Roadmap...");
  await prisma.complianceItem.createMany({
    data: [
      // Monthly Statutory Obligations
      { title: "PAYE & NSSF Submission", deadline: new Date("2026-04-09"), remindDaysBefore: 3, frequency: "Monthly", responsible: "HR Manager", category: "Statutory", status: "Pending", userId: hr.id },
      { title: "SHA (Social Health Authority)", deadline: new Date("2026-04-09"), remindDaysBefore: 3, frequency: "Monthly", responsible: "HR Manager", category: "Statutory", status: "Pending", userId: hr.id },
      { title: "VAT Filing", deadline: new Date("2026-04-20"), remindDaysBefore: 7, frequency: "Monthly", responsible: "Accountant", category: "Tax", status: "Pending", userId: accountant.id },
      
      // Annual / Bi-Annual Business Obligations
      { title: "CR12 Bi-Annual Update", deadline: new Date("2026-06-30"), remindDaysBefore: 14, frequency: "Bi-Annual", responsible: "Admin", category: "Legal", status: "Pending", userId: admin.id },
      { title: "Income Tax Returns", deadline: new Date("2026-04-30"), remindDaysBefore: 14, frequency: "Annual", responsible: "Accountant", category: "Tax", status: "Pending", userId: accountant.id },
      { title: "Sheria House Returns", deadline: new Date("2026-03-31"), remindDaysBefore: 7, frequency: "Annual", responsible: "Admin", category: "Legal", status: "Completed", userId: admin.id },
      
      // Certifications & Permits
      { title: "NCA Certification Renewal", deadline: new Date("2026-06-30"), remindDaysBefore: 30, frequency: "Annual", responsible: "Operations Manager", category: "Certification", status: "Pending", userId: opsManager.id },
      { title: "Business Permit & Workplace Reg", deadline: new Date("2027-02-10"), remindDaysBefore: 30, frequency: "Annual", responsible: "Operations Manager", category: "Permit", status: "Pending", userId: opsManager.id }
    ],
  });

  console.log("✅ BHL MANAGEMENT SYSTEM FULLY SEEDED!");
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