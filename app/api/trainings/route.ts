import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// 1. DATABASE CONNECTION SETUP (PostgreSQL Optimized)
const connectionString = `${process.env.DATABASE_URL}`;
const pool = new pg.Pool({ connectionString });

type PrismaPgAdapterArgs = ConstructorParameters<typeof PrismaPg>[0];
const adapter = new PrismaPg(pool as unknown as PrismaPgAdapterArgs);
const prisma = new PrismaClient({ adapter });

/**
 * HELPER: Checks if a date is within the Kenyan Q2 Compliance window (April-June)
 */
function isAprilToJune(date: Date) {
  const month = date.getMonth() + 1; 
  return month >= 4 && month <= 6;
}

// 2. GET: Fetch all trainings for the Dashboard
export async function GET() {
  try {
    const trainings = await prisma.training.findMany({
      orderBy: { startDate: "desc" },
    });
    return NextResponse.json(trainings);
  } catch (error) {
    console.error("❌ Fetch Error:", error);
    return NextResponse.json({ error: "Failed to fetch trainings" }, { status: 500 });
  }
}

// 3. POST: Create Training with Budget, Q2 Logic & Fallbacks
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Destructure data sent from AddTrainingModal
    const { title, description, startDate, endDate, location, costKES } = body;

    // RULE 1: Budget Enforcement (KES 5,000 limit) - Logic Maintained
    const cost = parseFloat(costKES);
    if (cost > 5000) {
      return NextResponse.json(
        { error: "Budget Alert: KES 5,000 limit exceeded!" },
        { status: 400 }
      );
    }

    // RULE 2: Q2 Compliance Logic - Logic Maintained
    const start = new Date(startDate);
    if (isAprilToJune(start)) {
      console.log(`📅 Compliance Alert: ${title} is scheduled for the Q2 window.`);
    }

    /**
     * RELATIONSHIP REQUIREMENT:
     * We MUST find an admin because the schema says createdBy is mandatory.
     */
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

    // If no admin is found, we stop here to satisfy TypeScript and Prisma constraints
    if (!adminUser) {
      return NextResponse.json(
        { error: "No Admin user found. Please run your seed or add an admin in Prisma Studio." }, 
        { status: 500 }
      );
    }

    const training = await prisma.training.create({
      data: {
        title,
        description: description || "BHL Business Hub Training Session",
        startDate: start,
        endDate: endDate ? new Date(endDate) : start,
        location: location || "Ruiru Main Campus",
        costKES: cost,
        // FIX: No more 'undefined' error. adminUser is guaranteed here.
        createdBy: {
          connect: { id: adminUser.id }
        }
      },
    });

    return NextResponse.json(training, { status: 201 });
  } catch (error) {
    console.error("❌ API POST Error:", error);
    return NextResponse.json(
      { error: "Failed to create training. Verify database connection." }, 
      { status: 500 }
    );
  }
}

// 4. DELETE: Remove Training by ID - Logic Maintained
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

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
      { error: "Could not delete. Check for database relations." }, 
      { status: 500 }
    );
  }
}
