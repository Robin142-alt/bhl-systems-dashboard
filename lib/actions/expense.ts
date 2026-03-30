"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function addExpense(formData: FormData) {
  const session = await getServerSession(authOptions);
  
  // Guard clause to ensure TypeScript knows the user ID exists
  if (!session || !session.user || !session.user.id) {
    return { error: "Not authenticated or User ID missing." };
  }

  const amount = parseFloat(formData.get("amount") as string);
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;
  const vendorIdRaw = formData.get("vendorId");
  
  // Only parse Vendor ID if the user actually selected one
  const vendorId = vendorIdRaw ? parseInt(vendorIdRaw as string) : null;

  try {
    await prisma.operationalExpense.create({
      data: {
        amount,
        description,
        category,
        vendorId,
        createdById: parseInt(session.user.id),
      },
    });

    revalidatePath("/dashboard/expenses");
    return { success: true };
  } catch (error) {
    console.error("Expense Creation Error:", error);
    return { error: "Failed to log expense. Please try again." };
  }
}