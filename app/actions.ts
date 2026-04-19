"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma"; 
import { TrainingStatus, Role } from "@prisma/client";
import { startOfMonth, endOfMonth, addDays } from "date-fns";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

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

    return { data: items, alerts: upcomingDeadlines.length };
  } catch (error) {
    console.error("📊 Dashboard Fetch Error:", error);
    return { data: [], alerts: 0 };
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
        remindDaysBefore: Number(remindDays) || 0,
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

export async function createTrainingItem(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!session?.user?.email) redirect("/dashboard?error=Unauthorized");

  const title = formData.get("title") as string;
  const startDateStr = formData.get("startDate") as string;
  const costKESStr = formData.get("costKES") as string;
  const location = formData.get("location") as string;
  const description = formData.get("description") as string;
  
  if (!title || !startDateStr || !costKESStr) redirect("/dashboard?error=Missing+fields");

  const startDate = new Date(startDateStr);
  const costKES = Math.round(parseFloat(costKESStr));

  if (costKES > 5000) {
    redirect("/dashboard?error=Budget+Exceeded");
  }

  let dbError = false;
  try {
    const dbUser = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!dbUser || (dbUser.role !== "ADMIN" && dbUser.role !== "HR")) {
      dbError = true;
    } else {
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
    }
  } catch (error) {
    console.error("❌ Error scheduling training:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard?error=Database+error");
  } else {
    redirect("/dashboard?success=Training+created");
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

    const hashedPassword = await bcrypt.hash("BHL-Temp-2026", 10);
    await prisma.user.create({
      data: {
        name,
        email,
        role,
        password: hashedPassword,
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
  if (!session?.user?.email) return { success: false, data: null };

  const firstDay = startOfMonth(new Date());

  try {
    const opEx = await prisma.operationalExpense.aggregate({
      where: { date: { gte: firstDay } },
      _sum: { amount: true }
    });

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
    return { success: false, data: null };
  }
}

/**
 * ==========================================
 * 5. ICT & ASSET MANAGEMENT
 * ==========================================
 */

export async function createSoftwareSubscription(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!session?.user?.email) redirect("/dashboard/ict/software?error=Unauthorized");

  const name = formData.get("name") as string;
  const provider = formData.get("provider") as string;
  const billingCycle = formData.get("billingCycle") as string;
  const cost = parseFloat(formData.get("cost") as string);
  const nextBillingDateStr = formData.get("nextBillingDate") as string;

  if (!name || isNaN(cost) || !nextBillingDateStr) redirect("/dashboard/ict/software?error=Missing+fields");

  let dbError = false;
  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      dbError = true;
    } else {
      await prisma.softwareSubscription.create({
        data: {
          name,
          provider: provider || null,
          billingCycle: billingCycle || "MONTHLY",
          cost,
          nextBillingDate: new Date(nextBillingDateStr),
          userId: user.id,
        }
      });
      revalidatePath("/dashboard/ict/software");
      revalidatePath("/dashboard/ict");
    }
  } catch (error) {
    console.error("❌ Error creating subscription:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard/ict/software?error=Database+error");
  } else {
    redirect("/dashboard/ict/software?success=1");
  }
}

export async function deleteSoftwareSubscription(id: number): Promise<void> {
  if (!id) return;
  try {
    await prisma.softwareSubscription.delete({ where: { id: Number(id) } });
    revalidatePath("/dashboard/ict/software");
    revalidatePath("/dashboard/ict");
  } catch (error) {
    console.error("❌ Error deleting subscription:", error);
  }
}

export async function createHardwareAsset(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!session?.user?.email) redirect("/dashboard/ict/hardware?error=Unauthorized");

  const name = formData.get("name") as string;
  const serialNumber = formData.get("serialNumber") as string;
  const purchaseDateStr = formData.get("purchaseDate") as string;

  if (!name) redirect("/dashboard/ict/hardware?error=Name+required");

  let dbError = false;
  try {
    await prisma.asset.create({
      data: {
        name,
        type: "HARDWARE",
        serialNumber: serialNumber || null,
        purchaseDate: purchaseDateStr ? new Date(purchaseDateStr) : null,
      }
    });

    revalidatePath("/dashboard/ict/hardware");
    revalidatePath("/dashboard/ict");
  } catch (error) {
    console.error("❌ Error creating hardware asset:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard/ict/hardware?error=Database+error");
  } else {
    redirect("/dashboard/ict/hardware?success=1");
  }
}

export async function addMaintenanceLog(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!session?.user?.email) redirect("/dashboard/ict/hardware?error=Unauthorized");

  const assetId = parseInt(formData.get("assetId") as string);
  const description = formData.get("description") as string;
  const cost = parseFloat(formData.get("cost") as string);
  const serviceDateStr = formData.get("serviceDate") as string;
  const nextServiceDateStr = formData.get("nextServiceDate") as string;

  if (isNaN(assetId) || !description || isNaN(cost)) redirect("/dashboard/ict/hardware?error=Missing+fields");

  let dbError = false;
  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      dbError = true;
    } else {
      await prisma.maintenanceLog.create({
        data: {
          assetId,
          description,
          cost,
          serviceDate: serviceDateStr ? new Date(serviceDateStr) : new Date(),
          nextServiceDate: nextServiceDateStr ? new Date(nextServiceDateStr) : null,
          performedById: user.id,
        }
      });

      revalidatePath("/dashboard/ict/hardware");
      revalidatePath("/dashboard/ict");
    }
  } catch (error) {
    console.error("❌ Error adding maintenance log:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard/ict/hardware?error=Database+error");
  } else {
    redirect("/dashboard/ict/hardware?success=1");
  }
}

/**
 * ==========================================
 * 6. OFFICE ADMINISTRATION
 * ==========================================
 */

export async function createOfficeAsset(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!session?.user?.email) redirect("/dashboard/office/facilities?error=Unauthorized");

  const name = formData.get("name") as string;
  const type = formData.get("type") as string; // BUILDING, VEHICLE, FURNITURE
  const serialNumber = formData.get("serialNumber") as string;
  const purchaseDateStr = formData.get("purchaseDate") as string;

  if (!name || !type) redirect("/dashboard/office/facilities?error=Missing+fields");

  let dbError = false;
  try {
    await prisma.asset.create({
      data: {
        name,
        type,
        serialNumber: serialNumber || null,
        purchaseDate: purchaseDateStr ? new Date(purchaseDateStr) : null,
      }
    });

    revalidatePath("/dashboard/office/facilities");
    revalidatePath("/dashboard/office");
  } catch (error) {
    console.error("❌ Error creating office asset:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard/office/facilities?error=Database+error");
  } else {
    redirect("/dashboard/office/facilities?success=1");
  }
}

export async function logOfficeSupplyExpense(formData: FormData): Promise<void> {
  const session = await getServerSession();
  if (!session?.user?.email) redirect("/dashboard/office/supplies?error=Unauthorized");

  const description = formData.get("description") as string;
  const category = formData.get("category") as string; 
  const amount = parseFloat(formData.get("amount") as string);
  const dateStr = formData.get("date") as string;

  if (!description || !category || isNaN(amount)) redirect("/dashboard/office/supplies?error=Missing+fields");

  let dbError = false;
  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      dbError = true;
    } else {
      await prisma.operationalExpense.create({
        data: {
          description,
          category,
          amount,
          date: dateStr ? new Date(dateStr) : new Date(),
          createdById: user.id,
        }
      });

      revalidatePath("/dashboard/office/supplies");
      revalidatePath("/dashboard/office");
      revalidatePath("/dashboard/expenses");
    }
  } catch (error) {
    console.error("❌ Error logging supply expense:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard/office/supplies?error=Database+error");
  } else {
    redirect("/dashboard/office/supplies?success=1");
  }
}