import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // This pulls from our new "Global Connector"
// JOB 1: SAVE A NEW RECORD (When you upload)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { trainingId, staffName, staffEmail, certificateUrl } = body;

    const newRecord = await prisma.attendance.create({
      data: {
        trainingId: Number(trainingId),
        staffName,
        staffEmail,
        attended: true,
        certificateUrl,
      },
    });

    return NextResponse.json(newRecord);
  } catch (error) {
    console.error("Database Save Error:", error);
    return NextResponse.json({ error: "Could not save attendance" }, { status: 500 });
  }
}

// JOB 2: FIND RECORDS (When you search)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // This tells Prisma to find the person AND include the Training info
    const records = await prisma.attendance.findMany({
      where: {
        staffName: {
          contains: name, // This finds "Alice" even if you type "Ali"
          mode: 'insensitive' // This ignores Capital Letters (alice vs Alice)
        }
      },
      include: {
        training: true // This grabs the Training Title for us
      },
      orderBy: {
        createdAt: 'desc' // Shows newest trainings first
      }
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error("Search Error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}