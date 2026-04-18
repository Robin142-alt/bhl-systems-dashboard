import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, category, officer, dueDate, frequency, userId } = body;

    const newRequirement = await prisma.complianceItem.create({
      data: {
        title: name,
        category,
        responsible: officer,
        deadline: new Date(dueDate),
        status: "Pending",

        // REQUIRED BY PRISMA SCHEMA
        frequency: frequency ?? "MONTHLY",

        user: {
          connect: {
            id: userId ?? 1, // fallback user
          },
        },
      },
    });

    return NextResponse.json(newRequirement, { status: 201 });

  } catch (error) {
    console.error("Database Error:", error);
    return NextResponse.json(
      { error: "Failed to create requirement" },
      { status: 500 }
    );
  }
}