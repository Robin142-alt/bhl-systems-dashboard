"use server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function addVendor(formData: FormData) {
  const name = formData.get("name") as string;
  const category = formData.get("category") as string;
  const contactPerson = formData.get("contactPerson") as string;
  const phone = formData.get("phone") as string;

  try {
    await prisma.vendor.create({
      data: { name, category, contactPerson, phone },
    });

    revalidatePath("/dashboard/vendors");
    return { success: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return { error: "A vendor with this name already exists." };
      }
    }
    return { error: "Failed to create vendor. Please try again." };
  }
}
