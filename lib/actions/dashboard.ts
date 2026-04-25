"use server"; // 1. Always the first line for build success

import { prisma } from "@/lib/prisma"; // 2. Use the shared client, NOT 'new PrismaClient()'
import { listAllHydratedWorkItems } from "@/lib/work-items";

export async function getDashboardStats() {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date();
    
    // Setting the window to 7 days for "Urgent" alerts
    sevenDaysFromNow.setDate(now.getDate() + 7);

    // 1. Fetch Critical Items (Due in 7 days or already Overdue)
    // Using the shared 'prisma' instance prevents connection leaks
    const criticalItems = (await listAllHydratedWorkItems())
      .filter((item) => item.deadline <= sevenDaysFromNow && item.status !== "Completed")
      .sort((left, right) => left.deadline.getTime() - right.deadline.getTime());

    // 2. Fetch Active Training Sessions
    const activeTrainings = await prisma.training.findMany({
      where: { status: 'SCHEDULED' },
      take: 3,
      orderBy: { startDate: 'asc' }
    });

    return { criticalItems, activeTrainings };
  } catch (error) {
    console.error("Dashboard Data Fetch Error:", error);
    // Return empty arrays so the UI doesn't crash on error
    return { criticalItems: [], activeTrainings: [] };
  }
  // 3. Removed prisma.$disconnect(). In Next.js, we let the 
  // shared client manage the connection pool for better speed.
}
