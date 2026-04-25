import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.headers.get("x-cron-secret") ||
    "";
  const cronSecret = process.env.CRON_SECRET?.trim();

  return Boolean(cronSecret && token.trim() === cronSecret);
}

export async function GET(request: Request) {
  const authorized = isAuthorized(request);

  if (!authorized) {
    return NextResponse.json(
      {
        ok: true,
        time: new Date().toISOString(),
      },
      { status: 200 },
    );
  }

  try {
    // Lightweight DB connectivity check. Avoids leaking data.
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        ok: true,
        time: new Date().toISOString(),
        db: "ok",
        storageMode: process.env.DOCUMENT_STORAGE_MODE || "default",
        vercel: Boolean(process.env.VERCEL),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[health] DB check failed:", error);

    return NextResponse.json(
      {
        ok: false,
        time: new Date().toISOString(),
        db: "failed",
      },
      { status: 503 },
    );
  }
}

