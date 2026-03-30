"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function addInventoryItem(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: "Not authenticated" };

  const name = formData.get("name") as string;
  const category = formData.get("category") as string;
  const sku = formData.get("sku") as string || null;
  const quantity = parseInt(formData.get("quantity") as string) || 0;
  const minQuantity = parseInt(formData.get("minQuantity") as string) || 5;
  const unitPrice = parseFloat(formData.get("unitPrice") as string) || 0;

  try {
    await prisma.inventoryItem.create({
      data: {
        name,
        category,
        sku,
        quantity,
        minQuantity,
        unitPrice,
        // Create initial movement record
        movements: {
          create: {
            type: "IN",
            quantity,
            reason: "Initial Stock Entry",
            performedById: parseInt(session.user.id),
          }
        }
      },
    });

    revalidatePath("/dashboard/inventory");
    return { success: true };
  } catch (error) {
    console.error("Inventory Error:", error);
    return { error: "Failed to add item. Ensure the name/SKU is unique." };
  }
}