import { NextResponse } from "next/server"; // Note: Changed to 'next/server'
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // 1. Go to Neon database and find all tasks
    const tasks = await prisma.task.findMany({
      orderBy: {
        deadline: 'asc',
      },
    });

    // 2. Use NextResponse to send the data back to the Dashboard
    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Database Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch BHL tasks" }, 
      { status: 500 }
    );
  }
}