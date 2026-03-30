"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function issueStock(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: "Not authenticated" };

  const itemId = parseInt(formData.get("itemId") as string);
  const quantityToIssue = parseInt(formData.get("quantity") as string);
  const reason = formData.get("reason") as string;

  try {
    // 1. Fetch current stock to check availability
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId }
    });

    if (!item) return { error: "Item not found." };
    if (item.quantity < quantityToIssue) {
      return { error: `Insufficient stock. Only ${item.quantity} available.` };
    }

    // 2. Perform the update and log movement in a Transaction
    await prisma.$transaction([
      prisma.inventoryItem.update({
        where: { id: itemId },
        data: { quantity: { decrement: quantityToIssue } }
      }),
      prisma.stockMovement.create({
        data: {
          itemId,
          type: "OUT",
          quantity: quantityToIssue,
          reason,
          performedById: parseInt(session.user.id),
        }
      })
    ]);

    revalidatePath("/dashboard/inventory");
    return { success: true };
  } catch (error) {
    console.error("Stock Issue Error:", error);
    return { error: "Failed to issue stock." };
  }
}