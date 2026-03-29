"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma"; 
import { TrainingStatus } from "@prisma/client";

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
    // 1. Double check if certificate already exists
    const existingCert = await prisma.certificate.findUnique({
      where: { attendanceId }
    });

    if (existingCert) return existingCert.certificateNo;

    // 2. Verify attendance and participation
    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: { training: true }
    });

    if (!attendance || !attendance.attended) {
      console.error("⛔ Unauthorized: Staff did not attend.");
      return null;
    }

    // 3. Generate Sequential Certificate Number
    const count = await prisma.certificate.count();
    const year = new Date().getFullYear();
    const serial = (count + 1).toString().padStart(3, '0');
    const newCertNo = `BHL-${year}-${serial}`;

    // 4. Create in DB
    const newCert = await prisma.certificate.create({
      data: {
        certificateNo: newCertNo,
        attendanceId: attendanceId,
      },
    });

    // 5. Revalidate the specific training page
    revalidatePath(`/dashboard/training/${attendance.trainingId}`);
    
    return newCert.certificateNo;
  } catch (error) {
    console.error("❌ Failed to generate certificate:", error);
    return null;
  }
}