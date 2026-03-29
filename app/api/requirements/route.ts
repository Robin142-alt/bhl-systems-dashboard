import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, category, officer, dueDate } = body;

    const newRequirement = await prisma.requirement.create({
      data: {
        name,
        category,
        officer,
        dueDate: new Date(dueDate),
      },
    });

    return NextResponse.json(newRequirement, { status: 201 });
    } catch (error) {
  // Now 'error' is used, so the warning disappears
  console.error("Database Error:", error); 
  return NextResponse.json({ error: "Failed to create requirement" }, { status: 500 });
}
}