"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function addMaintenanceLog(formData: FormData) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) return { error: "Not authenticated" };

  const assetId = parseInt(formData.get("assetId") as string);
  const vendorIdRaw = formData.get("vendorId") as string;
  const description = formData.get("description") as string;
  const cost = parseFloat(formData.get("cost") as string) || 0;
  const nextServiceDateRaw = formData.get("nextServiceDate") as string;

  try {
    await prisma.maintenanceLog.create({
      data: {
        assetId,
        vendorId: vendorIdRaw ? parseInt(vendorIdRaw) : null,
        description,
        cost,
        serviceDate: new Date(), // We use the direct Date object here
        nextServiceDate: nextServiceDateRaw ? new Date(nextServiceDateRaw) : null,
        performedById: parseInt(session.user.id),
      },
    });

    revalidatePath("/dashboard/assets");
    return { success: true };
  } catch (error) {
    console.error("Maintenance Log Error:", error);
    return { error: "Failed to save maintenance log." };
  }
}