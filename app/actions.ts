"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma"; 
import { TrainingStatus, Role } from "@prisma/client";
import { startOfMonth, endOfMonth, addDays } from "date-fns";

/**
 * ==========================================
 * 1. COMPLIANCE & DASHBOARD OVERVIEW
 * ==========================================
 */

export async function getComplianceOverview() {
  try {
    const today = new Date();
    const soon = addDays(today, 7); 

    const items = await prisma.complianceItem.findMany({
      where: {
        deadline: {
          gte: startOfMonth(today),
          lte: endOfMonth(today),
        },
      },
      orderBy: { deadline: 'asc' }
    });

    const upcomingDeadlines = items.filter(item => 
      new Date(item.deadline) <= soon && item.status !== "Completed"
    );

    return { success: true, data: items, alerts: upcomingDeadlines.length };
  } catch (error) {
    console.error("📊 Dashboard Fetch Error:", error);
    return { success: false, error: "Failed to fetch compliance overview" };
  }
}

export async function createComplianceItem(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!session?.user?.email) return;

  const title = formData.get("title") as string;
  const category = formData.get("category") as string;
  const responsible = formData.get("responsible") as string;
  const deadlineStr = formData.get("deadline") as string;
  const remindDays = parseInt(formData.get("remindDaysBefore") as string) || 7;

  if (!title || !deadlineStr) return;

  try {
    const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!dbUser) return;

    await prisma.complianceItem.create({
      data: {
        title,
        category,
        responsible: responsible, // Mapping to schema field
        deadline: new Date(deadlineStr),
        remindDaysBefore: remindDays,
        status: "Pending",
        frequency: "Monthly", 
        userId: dbUser.id, 
      },
    });
    
    revalidatePath("/");
    revalidatePath("/dashboard"); 
  } catch (error) {
    console.error("❌ Error creating compliance item:", error);
  }
}

export async function markAsCompleted(id: number): Promise<void> {
  if (!id) return;
  try {
    await prisma.complianceItem.update({
      where: { id: Number(id) }, 
      data: { status: "Completed" },
    });
    revalidatePath("/");
    revalidatePath("/dashboard"); 
  } catch (error) {
    console.error("❌ Error updating status:", error);
  }
}

export async function deleteComplianceItem(id: number): Promise<void> {
  if (!id) return;
  try {
    await prisma.complianceItem.delete({ where: { id: Number(id) } });
    revalidatePath("/");
    revalidatePath("/dashboard");
  } catch (error) {
    console.error("❌ Error deleting item:", error);
  }
}

/**
 * ==========================================
 * 2. TRAINING & CERTIFICATE MODULE
 * ==========================================
 */

export async function createTrainingItem(formData: FormData) {
  const session = await getServerSession();
  if (!session?.user?.email) return { success: false, error: "Unauthorized" };

  const title = formData.get("title") as string;
  const startDateStr = formData.get("startDate") as string;
  const costKESStr = formData.get("costKES") as string;
  const location = formData.get("location") as string;
  const description = formData.get("description") as string;
  
  if (!title || !startDateStr || !costKESStr) return { success: false, error: "Missing fields" };

  const startDate = new Date(startDateStr);
  const costKES = Math.round(parseFloat(costKESStr));

  // --- BUSINESS LOGIC: Enforce KES 5,000 Budget ---
  if (costKES > 5000) {
    return { success: false, error: "Budget Exceeded: Maximum KES 5,000 per training." };
  }

  // --- BUSINESS LOGIC: Check April-June Window ---
  const month = startDate.getMonth(); // 3 = April, 5 = June
  const isCorrectWindow = month >= 3 && month <= 5;

  try {
    const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!dbUser || (dbUser.role !== "ADMIN" && dbUser.role !== "HR")) return { success: false, error: "Access Denied" };

    await prisma.training.create({
      data: {
        title,
        description: description || null,
        startDate,
        endDate: new Date(startDate.getTime() + (2 * 60 * 60 * 1000)), 
        location: location || null,
        costKES,
        budgetKES: 5000,
        status: "SCHEDULED" as TrainingStatus, 
        createdById: dbUser.id, 
      },
    });
    
    revalidatePath("/");
    revalidatePath("/dashboard"); 
    return { success: true, warning: !isCorrectWindow ? "Note: Outside April-June window." : null };
  } catch (error) {
    console.error("❌ Error scheduling training:", error);
    return { success: false, error: "Database error" };
  }
}

export async function toggleAttendance(trainingId: number, userId: number): Promise<void> {
  const session = await getServerSession();
  if (!session?.user?.email) return;
  
  try {
    const existing = await prisma.attendance.findUnique({
      where: { userId_trainingId: { userId, trainingId } }
    });

    if (existing) {
      await prisma.attendance.update({
        where: { id: existing.id },
        data: { attended: !existing.attended }
      });
    } else {
      await prisma.attendance.create({
        data: { trainingId, userId, attended: true }
      });
    }

    revalidatePath(`/dashboard/training/${trainingId}`);
    revalidatePath("/dashboard");
  } catch (error) {
    console.error("❌ Error updating attendance:", error);
  }
}

export async function generateCertificateRecord(attendanceId: number): Promise<string | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const existingCert = await tx.certificate.findUnique({ where: { attendanceId } });
      if (existingCert) return existingCert.certificateNo;

      const attendance = await tx.attendance.findUnique({
        where: { id: attendanceId },
        include: { training: true }
      });

      if (!attendance || !attendance.attended) return null;

      const count = await tx.certificate.count();
      const year = new Date().getFullYear();
      const serial = (count + 1).toString().padStart(3, '0');
      const newCertNo = `BHL-${year}-${serial}`;

      const newCert = await tx.certificate.create({
        data: { certificateNo: newCertNo, attendanceId: attendanceId },
      });

      revalidatePath(`/dashboard/training/${attendance.trainingId}`);
      revalidatePath("/dashboard");
      return newCert.certificateNo;
    });
  } catch (error) {
    console.error("❌ Certificate Error:", error);
    return null;
  }
}

/**
 * ==========================================
 * 3. STAFF & USER MANAGEMENT
 * ==========================================
 */

export async function createEmployee(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!session?.user?.email) return;

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const roleInput = formData.get("role") as string;
  
  const allowedRoles = ["ADMIN", "HR", "ACCOUNTANT", "OPERATIONS_MANAGER"];
  const role = (allowedRoles.includes(roleInput) ? roleInput : "USER") as Role;

  if (!name || !email) return;

  try {
    const admin = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!admin || (admin.role !== "ADMIN" && admin.role !== "HR")) return;

    await prisma.user.create({
      data: {
        name,
        email,
        role,
        password: "BHL-Temp-Password-2026", 
        isActive: true,
      },
    });

    revalidatePath("/staff");
    revalidatePath("/dashboard");
  } catch (error) {
    console.error("❌ Error creating employee:", error);
  }
}

export async function deleteEmployee(id: number): Promise<void> {
  try {
    await prisma.user.delete({ where: { id: Number(id) } });
    revalidatePath("/staff");
    revalidatePath("/dashboard");
  } catch (error) {
    console.error("❌ Error deleting employee:", error);
  }
}

/**
 * ==========================================
 * 4. BUDGET & ICT FINANCIALS
 * ==========================================
 */

export async function getMonthlyBudgetStats() {
  const session = await getServerSession();
  if (!session?.user?.email) return { success: false, error: "Unauthorized" };

  const firstDay = startOfMonth(new Date());

  try {
    const opEx = await prisma.operationalExpense.aggregate({
      where: { date: { gte: firstDay } },
      _sum: { amount: true }
    });

    // Detailed ICT Maintenance logic (Hardware vs Software)
    const logs = await prisma.maintenanceLog.findMany({
      where: { serviceDate: { gte: firstDay } },
      include: { asset: true }
    });

    const hardwareSum = logs.filter(l => l.asset.type === "HARDWARE").reduce((a, b) => a + b.cost, 0);
    const softwareSum = logs.filter(l => l.asset.type === "SOFTWARE").reduce((a, b) => a + b.cost, 0);

    const trainingEx = await prisma.training.aggregate({
      where: { startDate: { gte: firstDay } },
      _sum: { costKES: true }
    });

    return { 
      success: true, 
      data: {
        operational: opEx._sum.amount || 0,
        maintenance: hardwareSum,
        softwareSubscriptions: softwareSum,
        training: trainingEx._sum.costKES || 0,
        totalSpent: (opEx._sum.amount || 0) + hardwareSum + softwareSum + (trainingEx._sum.costKES || 0),
        month: new Date().toLocaleString('default', { month: 'long' })
      } 
    };
  } catch (error) {
    console.error("📊 Budget Error:", error);
    return { success: false, error: "Calculation failed" };
  }
}