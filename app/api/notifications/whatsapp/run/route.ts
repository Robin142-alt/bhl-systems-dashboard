import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { canApproveRole } from "@/lib/compliance-workflow";
import { runWhatsAppReminderSweep } from "@/lib/whatsapp-reminders";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const providedToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : request.headers.get("x-cron-secret");

  if (cronSecret && providedToken === cronSecret) {
    return true;
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });

  return canApproveRole(user?.role);
}

async function handleRun(request: Request) {
  const authorized = await isAuthorized(request);

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await runWhatsAppReminderSweep();
  return NextResponse.json(report, { status: report.success ? 200 : 503 });
}

export async function GET(request: Request) {
  return handleRun(request);
}

export async function POST(request: Request) {
  return handleRun(request);
}
