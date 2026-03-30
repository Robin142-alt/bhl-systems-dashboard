"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma"; 
import { TrainingStatus, Role } from "@prisma/client"; // FIXED: Added Role import

/**
 * ==========================================
 * 1. COMPLIANCE MODULE ACTIONS
 * ==========================================
 */

export async function createComplianceItem(formData: FormData): Promise<void> {
  const session = await getServerSession();
  
  if (!session?.user?.email) {
    console.error("❌ No active session found.");
    return;
  }

  const title = formData.get("title") as string;
  const category = formData.get("category") as string;
  const responsible = formData.get("responsible") as string;
  const deadlineStr = formData.get("deadline") as string;
  
  if (!title || !deadlineStr) {
    console.error("❌ Missing required fields");
    return;
  }

  const deadline = new Date(deadlineStr);

  try {
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!dbUser) {
      console.error("❌ User record not found in database.");
      return;
    }

    await prisma.complianceItem.create({
      data: {
        title,
        category,
        responsible,
        deadline,
        status: "Pending", 
        frequency: "Monthly", 
        userId: dbUser.id, 
      },
    });
    
    revalidatePath("/");
    revalidatePath("/dashboard"); 
    console.log("✅ New Compliance Item created successfully.");
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
    console.log(`✅ Item ${id} marked as completed`);
  } catch (error) {
    console.error("❌ Error updating status:", error);
  }
}

export async function deleteComplianceItem(id: number): Promise<void> {
  if (!id) return;
  try {
    await prisma.complianceItem.delete({
      where: { id: Number(id) },
    });
    
    revalidatePath("/");
    revalidatePath("/dashboard");
    console.log(`🗑️ Item ${id} deleted from BHL DB`);
  } catch (error) {
    console.error("❌ Error deleting item:", error);
  }
}

/**
 * ==========================================
 * 2. TRAINING MODULE ACTIONS
 * ==========================================
 */

export async function createTrainingItem(formData: FormData): Promise<void> {
  const session = await getServerSession();
  
  if (!session?.user?.email) {
    console.error("❌ No active session found.");
    return;
  }

  const title = formData.get("title") as string;
  const startDateStr = formData.get("startDate") as string;
  const costKESStr = formData.get("costKES") as string;
  const location = formData.get("location") as string;
  const description = formData.get("description") as string;
  
  if (!title || !startDateStr || !costKESStr) {
    console.error("❌ Missing required training fields");
    return;
  }

  const startDate = new Date(startDateStr);
  const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000)); 
  const costKES = Math.round(parseFloat(costKESStr));

  try {
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!dbUser || (dbUser.role !== "ADMIN" && dbUser.role !== "HR")) {
      console.error("⛔ Unauthorized: Only Admin/HR can create training.");
      return;
    }

    await prisma.training.create({
      data: {
        title,
        description: description || null,
        startDate,
        endDate,
        location: location || null,
        costKES,
        budgetKES: 5000,
        status: "SCHEDULED" as TrainingStatus, 
        createdById: dbUser.id, 
      },
    });
    
    revalidatePath("/");
    revalidatePath("/dashboard"); 
    console.log("✅ New Training Item scheduled successfully.");
  } catch (error) {
    console.error("❌ Error scheduling training:", error);
  }
}

/**
 * ==========================================
 * 3. ATTENDANCE & CERTIFICATE ACTIONS
 * ==========================================
 */

export async function toggleAttendance(trainingId: number, userId: number): Promise<void> {
  const session = await getServerSession();
  if (!session?.user?.email) return;
  
  const currentUser = await prisma.user.findUnique({
    where: { email: session.user.email }
  });

  if (!currentUser || (currentUser.role !== "HR" && currentUser.role !== "ADMIN")) {
    console.error("⛔ Unauthorized");
    return;
  }

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
  const session = await getServerSession();
  if (!session?.user?.email) return null;

  try {
    const existingCert = await prisma.certificate.findUnique({
      where: { attendanceId }
    });

    if (existingCert) return existingCert.certificateNo;

    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { training: true }
    });

    if (!attendance || !attendance.attended) {
      console.error("⛔ Unauthorized: Staff did not attend.");
      return null;
    }

    const count = await prisma.certificate.count();
    const year = new Date().getFullYear();
    const serial = (count + 1).toString().padStart(3, '0');
    const newCertNo = `BHL-${year}-${serial}`;

    const newCert = await prisma.certificate.create({
      data: {
        certificateNo: newCertNo,
        attendanceId: attendanceId,
      },
    });

    revalidatePath(`/dashboard/training/${attendance.trainingId}`);
    revalidatePath(`/dashboard/certificates/${newCertNo}`); // FIXED: Add certificate revalidation
    
    return newCert.certificateNo;
  } catch (error) {
    console.error("❌ Failed to generate certificate:", error);
    return null;
  }
}

/**
 * ==========================================
 * 4. STAFF & USER MANAGEMENT ACTIONS
 * ==========================================
 */

export async function createEmployee(formData: FormData): Promise<void> {
  const session = await getServerSession();
  
  if (!session?.user?.email) {
    console.error("❌ No active session found.");
    return;
  }

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const roleInput = formData.get("role") as string;
  
  // FIXED: Standardize role mapping to use the 'Role' Enum type
  const allowedRoles: string[] = ["ADMIN", "HR", "ACCOUNTANT", "OPERATIONS_MANAGER"];
  const role = (allowedRoles.includes(roleInput) ? roleInput : "USER") as Role;

  if (!name || !email) {
    console.error("❌ Missing required employee fields");
    return;
  }

  try {
    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!currentUser || (currentUser.role !== "ADMIN" && currentUser.role !== "HR")) {
      console.error("⛔ Unauthorized: Only Admin/HR can add staff.");
      return;
    }

    await prisma.user.create({
      data: {
        name,
        email,
        role,
        password: "BHL-Temp-Password-2026", 
        isActive: true, // Added support for your new schema field
      },
    });

    revalidatePath("/staff");
    revalidatePath("/dashboard");
    console.log(`✅ Employee ${name} created successfully.`);
  } catch (error) {
    console.error("❌ Error creating employee:", error);
  }
}

export async function deleteEmployee(id: number): Promise<void> {
  const session = await getServerSession();
  if (!session?.user?.email) return;

  try {
    await prisma.user.delete({
      where: { id },
    });
    revalidatePath("/staff");
    revalidatePath("/dashboard");
    console.log(`🗑️ Employee ID ${id} removed.`);
  } catch (error) {
    console.error("❌ Error deleting employee:", error);
  }
}