import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { trainingId, staffEmail, certificateUrl } = body;

    // 1. DUAL LOOKUP: Find the User AND check if Training exists
    // We fetch both at the same time to save a few milliseconds
    const [user, training] = await Promise.all([
      prisma.user.findUnique({ where: { email: staffEmail } }),
      prisma.training.findUnique({ where: { id: Number(trainingId) } })
    ]);

    // 2. GUARD CLAUSES: Verify the staff member and training exist in BHL records
    if (!user) {
      return NextResponse.json(
        { error: `Staff member not found with email: ${staffEmail}` },
        { status: 404 }
      );
    }

    if (!training) {
      return NextResponse.json(
        { error: `Training module ID ${trainingId} not found` },
        { status: 404 }
      );
    }

    // 3. ATOMIC CREATION: Record the attendance and the certificate link
    const attendance = await prisma.attendance.create({
      data: {
        // We use IDs here because that's what the database expects (Foreign Keys)
        trainingId: training.id,
        userId: user.id,
        attended: true,
        // Nested create: This creates the certificate entry and links it automatically
        certificate: certificateUrl ? {
          create: {
            certificateNo: `BHL-CERT-${Date.now()}-${user.id}`,
            fileUrl: certificateUrl,
            issueDate: new Date(),
          }
        } : undefined
      },
      include: {
        user: true,      // Includes the staff name/email in the response
        training: true,  // Includes the course details
        certificate: true // Includes the new certificate details
      }
    });

    return NextResponse.json({
      success: true,
      message: "Training achievement recorded and certificate linked.",
      data: attendance
    });

  } catch (error) {
    console.error("❌ Attendance Creation Error:", error);
    return NextResponse.json(
      { error: "Internal server error while recording achievement" },
      { status: 500 }
    );
  }
}