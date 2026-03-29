import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export async function POST(req: Request) {
  try {
    const { trainingId, staffName, staffEmail, attended } = await req.json();

    // This "upsert" means: If the record exists, update it. If not, create it!
    const record = await prisma.attendance.create({
      data: {
        trainingId: Number(trainingId),
        staffName,
        staffEmail,
        attended: Boolean(attended),
      },
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error("The database had a hiccup:", error); // Now you are USING the error!
    return NextResponse.json({ error: "Attendance failed" }, { status: 500 });
  }
}