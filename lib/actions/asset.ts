"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function registerAsset(formData: FormData) {
  const name = formData.get("name") as string;
  const type = formData.get("type") as string;
  const serialNumber = formData.get("serialNumber") as string;
  const status = formData.get("status") as string || "OPERATIONAL";

  try {
    await prisma.asset.create({
      data: {
        name,
        type,
        serialNumber: serialNumber || null,
        status,
      },
    });

    revalidatePath("/dashboard/assets");
    return { success: true };
  } catch (error) {
    console.error("Asset Registration Error:", error);
    return { error: "Failed to register asset. Check if the name is unique." };
  }
}