// File: app/api/compliance/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 2. GET HANDLER
 * Fetches compliance items for the Dashboard table.
 */
export async function GET() {
  try {
    const complianceItems = await prisma.complianceItem.findMany({
      orderBy: { deadline: 'asc' }, // Keeps urgent tasks at the top
    });

    // Senior Debug Log
    console.log(`✅ [API/COMPLIANCE]: Found ${complianceItems.length} items`);
    
    return NextResponse.json(complianceItems);
  } catch (error) {
    console.error("❌ [API/COMPLIANCE] GET ERROR:", error);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}

/**
 * 3. POST HANDLER
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
        deadline: new Date(body.deadline), // Force ISO conversion
        frequency: body.frequency || "Monthly", 
        responsible: body.responsible || "Admin",
        category: body.category || "General",
        status: "Pending", // Hardcoded default for safety
        remindDaysBefore: 7,
        user: {
          connect: { id: body.userId } // Connect to existing user
        }
      },
    });

    console.log("🚀 [API/COMPLIANCE]: New Item Created:", newItem.title);
    return NextResponse.json(newItem, { status: 201 });

  } catch (error) {
    console.error("❌ [API/COMPLIANCE] POST ERROR:", error);
    return NextResponse.json({ error: "Failed to save requirement" }, { status: 500 });
  }
}