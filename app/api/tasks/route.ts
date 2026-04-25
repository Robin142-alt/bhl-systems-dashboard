import { NextResponse } from "next/server"; // Note: Changed to 'next/server'
import { listAllHydratedWorkItems } from "@/lib/work-items";

export async function GET() {
  try {
    const tasks = await listAllHydratedWorkItems();

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
