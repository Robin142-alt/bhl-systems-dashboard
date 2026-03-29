// app/lib/actions/dashboard.ts
'use server'
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getDashboardStats() {
  try {
    const now = new Date();
    const sevenDaysFromNow = new Date();
    // Setting the window to 7 days for "Urgent" alerts
    sevenDaysFromNow.setDate(now.getDate() + 7);

    // 1. Fetch Critical Items (Due in 7 days or already Overdue)
    const criticalItems = await prisma.complianceItem.findMany({
      where: {
        deadline: { lte: sevenDaysFromNow },
        status: { not: 'Completed' }
      },
      orderBy: { deadline: 'asc' }
    });

    // 2. Fetch Active Training Sessions (The April-June Requirement)
    const activeTrainings = await prisma.training.findMany({
      where: { status: 'SCHEDULED' },
      take: 3,
      orderBy: { startDate: 'asc' }
    });

    return { criticalItems, activeTrainings };
  } catch (error) {
    console.error("Dashboard Data Fetch Error:", error);
    return { criticalItems: [], activeTrainings: [] };
  } finally {
    await prisma.$disconnect();
  }
}