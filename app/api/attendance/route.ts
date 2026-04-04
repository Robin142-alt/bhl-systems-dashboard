import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// JOB 1: SAVE A NEW RECORD (Linking User, Training, and Certificate)
export async function POST(req: Request) {
  try {
    const { trainingId, staffEmail, certificateUrl } = await req.json();

    // 1. Find the official User and Training records first
    const [user, training] = await Promise.all([
      prisma.user.findUnique({ where: { email: staffEmail } }),
      prisma.training.findUnique({ where: { id: Number(trainingId) } })
    ]);

    // 2. Guard Clauses: If either doesn't exist, we can't create the link
    if (!user) return NextResponse.json({ error: "Staff email not found" }, { status: 404 });
    if (!training) return NextResponse.json({ error: "Training module not found" }, { status: 404 });

    // 3. The Atomic Create: Save Attendance and Certificate at once
    const newRecord = await prisma.attendance.create({
      data: {
        trainingId: training.id,
        userId: user.id, // <--- Correctly using the ID, not the email
        attended: true,
        // If there is a URL, create a linked Certificate record automatically
        certificate: certificateUrl ? {
          create: {
            certificateNo: `BHL-CERT-${Date.now()}`,
            fileUrl: certificateUrl,
            issueDate: new Date(),
          }
        } : undefined
      },
      include: {
        user: true,
        training: true,
        certificate: true
      }
    });

    return NextResponse.json(newRecord);
  } catch (error) {
    console.error("Database Save Error:", error);
    return NextResponse.json({ error: "Could not save attendance" }, { status: 500 });
  }
}

// JOB 2: FIND RECORDS (Searching through the User relation)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query"); // Renamed for clarity

    const records = await prisma.attendance.findMany({
      where: query ? {
        user: { // <--- Changed from 'staff' to 'user' to match schema
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } }
          ]
        }
      } : {},
      include: {
        user: true,
        training: true,
        certificate: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error("Search Error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}