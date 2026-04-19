// File: app/api/compliance/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET HANDLER
 * Fetches compliance items for the Dashboard table.
 */
export async function GET() {
  try {
    const complianceItems = await prisma.complianceItem.findMany({
      orderBy: { deadline: 'asc' },
    });
    
    return NextResponse.json(complianceItems);
  } catch (error) {
    console.error("[API/COMPLIANCE] GET ERROR:", error);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}

/**
 * POST HANDLER
 * Creates a new requirement from the dashboard.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validation: Ensure mandatory fields exist before hitting the DB
    if (!body.title || !body.deadline) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const newItem = await prisma.complianceItem.create({
      data: {
        title: body.title,
        deadline: new Date(body.deadline),
        frequency: body.frequency || "Monthly", 
        responsible: body.responsible || "Admin",
        category: body.category || "General",
        status: "Pending",
        remindDaysBefore: 7,
        user: {
          connect: { id: body.userId }
        }
      },
    });

    return NextResponse.json(newItem, { status: 201 });

  } catch (error) {
    console.error("[API/COMPLIANCE] POST ERROR:", error);
    return NextResponse.json({ error: "Failed to save requirement" }, { status: 500 });
  }
}