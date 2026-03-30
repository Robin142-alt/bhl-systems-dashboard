import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // We receive these from your frontend form
    const { trainingId, staffEmail, certificateUrl } = body; 

    // 1. DATA LOOKUP: We find the User by email to get their numeric ID
    const user = await prisma.user.findUnique({
      where: { email: staffEmail },
    });

    // 2. GUARD CLAUSE: If the email isn't in our User table, we stop here
    if (!user) {
      return NextResponse.json(
        { error: `No staff member found with email: ${staffEmail}` }, 
        { status: 404 }
      );
    }

    // 3. THE FIX: Create Attendance using 'userId' (not staffName)
    // We also handle the Certificate relationship defined in your schema
    const attendance = await prisma.attendance.create({
      data: {
        trainingId: Number(trainingId),
        userId: user.id, // This matches your Attendance model perfectly
        attended: true,
        // Since Attendance and Certificate are a 1-to-1 relation in your schema:
        certificate: certificateUrl ? {
          create: {
            certificateNo: `BHL-CERT-${Date.now()}`,
            fileUrl: certificateUrl,
            issueDate: new Date(),
          }
        } : undefined
      },
      include: {
        user: true,        // Includes name/email in the final response
        certificate: true  // Includes certificate details
      }
    });

    return NextResponse.json(attendance);
  } catch (error) {
    console.error("❌ Critical Build Fix Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}