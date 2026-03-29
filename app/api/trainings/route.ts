import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// 1. DATABASE CONNECTION SETUP
const connectionString = `${process.env.DATABASE_URL}`;
const pool = new pg.Pool({ connectionString });

// FIX: Casting 'pool' to the exact type PrismaPg expects using ConstructorParameters
type PrismaPgAdapterArgs = ConstructorParameters<typeof PrismaPg>[0];
const adapter = new PrismaPg(pool as unknown as PrismaPgAdapterArgs);
const prisma = new PrismaClient({ adapter });

/**
 * HELPER: Checks if a date is within the Kenyan Q2 Compliance window (April-June)
 * month 4 = April, month 6 = June
 */
function isAprilToJune(date: Date) {
  const month = date.getMonth() + 1; 
  return month >= 4 && month <= 6;
}

// 2. GET: Fetch all trainings
export async function GET() {
  try {
    const trainings = await prisma.training.findMany({
      // include: { attendees: true }, // Uncomment if your schema has an 'attendees' relation
      orderBy: { startDate: "desc" },
    });
    return NextResponse.json(trainings);
  } catch (error) {
    console.error("❌ Fetch Error:", error);
    return NextResponse.json({ error: "Failed to fetch trainings" }, { status: 500 });
  }
}

// 3. POST: Create Training with Budget & Date Logic
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, description, startDate, endDate, location, costKES } = body;

    // RULE: Budget Enforcement (KES 5,000 limit)
    const cost = parseFloat(costKES);
    if (cost > 5000) {
      return NextResponse.json(
        { error: "Budget Alert: KES 5,000 limit exceeded!" },
        { status: 400 }
      );
    }

    const start = new Date(startDate);
    const isQ2 = isAprilToJune(start);
    
    // Log the Q2 status so 'isQ2' is considered "used" by TypeScript
    if (isQ2) {
      console.log(`📅 Compliance Alert: ${title} is scheduled for the April-June window.`);
    }

    /**
     * RELATIONSHIP REQUIREMENT:
     * Your schema likely requires 'createdById'. We link this to the first ADMIN user.
     * Ensure you have run 'npx prisma db seed' so an Admin exists!
     */
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      return NextResponse.json({ error: "No Admin user found to assign this training." }, { status: 500 });
    }

    const training = await prisma.training.create({
      data: {
        title,
        description,
        startDate: start,
        endDate: new Date(endDate),
        location,
        costKES: cost,
        createdBy: {
          connect: { id: adminUser.id }
        }
      },
    });

    return NextResponse.json(training, { status: 201 });
  } catch (error) {
    console.error("❌ API POST Error:", error);
    return NextResponse.json({ error: "Failed to create training" }, { status: 500 });
  }
}

// 4. DELETE: Remove Training by ID
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    // FIX: Convert URL String ID to Number for the Database
    const idNumber = parseInt(id);
    if (isNaN(idNumber)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    await prisma.training.delete({
      where: { id: idNumber },
    });

    return NextResponse.json({ message: "Deleted successfully" });
  } catch (error) {
    console.error("❌ Delete Error:", error);
    return NextResponse.json(
      { error: "Could not delete. Check if staff are registered to this training." }, 
      { status: 500 }
    );
  }
}