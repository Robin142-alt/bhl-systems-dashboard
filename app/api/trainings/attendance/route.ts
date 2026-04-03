import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trainingId, staffEmail, certificateUrl } = body; 

    // 1. DUAL LOOKUP: Find the User AND check if Training exists
    const [user, training] = await Promise.all([
      prisma.user.findUnique({ where: { email: staffEmail } }),
      prisma.training.findUnique({ where: { id: Number(trainingId) } })
    ]);

    // 2. GUARD CLAUSES: Stop if data is missing
    if (!user) {
      return NextResponse.json(
        { error: `Staff member not found: ${staffEmail}` }, 
        { status: 404 }
      );
    }

    if (!training) {
      return NextResponse.json(
        { error: `Training module ID ${trainingId} not found` }, 
        { status: 404 }
      );
    }

    // 3. ATOMIC CREATION: Create Attendance + Certificate in one transaction
    const attendance = await prisma.attendance.create({
      data: {
        trainingId: training.id,
        userId: user.id,
        attended: true,
        // Using nested create for the 1-to-1 Certificate relation
        certificate: certificateUrl ? {
          create: {
            certificateNo: `BHL-CERT-${Date.now()}-${user.id}`,
            fileUrl: certificateUrl,
            issueDate: new Date(),
          }
        } : undefined
      },
      include: {
        user: true,        // For the Staff Name
        training: true,    // For the Course Title/Cost
        certificate: true  // For the File Link
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: "Achievement recorded successfully",
      data: attendance 
    });

  } catch (error) {
    console.error("❌ Attendance Creation Error:", error);
    return NextResponse.json(
      { error: "Failed to record training achievement" }, 
      { status: 500 }
    );
  }
}