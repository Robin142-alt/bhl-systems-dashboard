"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";

export async function addMaintenanceLog(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) redirect("/dashboard/assets?error=Not+authenticated");

  const assetId = parseInt(formData.get("assetId") as string);
  const vendorIdRaw = formData.get("vendorId") as string;
  const description = formData.get("description") as string;
  const cost = parseFloat(formData.get("cost") as string) || 0;
  const nextServiceDateRaw = formData.get("nextServiceDate") as string;

  let dbError = false;
  try {
    await prisma.maintenanceLog.create({
      data: {
        assetId,
        vendorId: vendorIdRaw ? parseInt(vendorIdRaw) : null,
        description,
        cost,
        serviceDate: new Date(), 
        nextServiceDate: nextServiceDateRaw ? new Date(nextServiceDateRaw) : null,
        performedById: parseInt(session.user.id),
      },
    });

    revalidatePath("/dashboard/assets");
  } catch (error) {
    console.error("Maintenance Log Error:", error);
    dbError = true;
  }

  if (dbError) {
    redirect("/dashboard/assets?error=Failed+to+save");
  } else {
    redirect("/dashboard/assets?success=1");
  }
}