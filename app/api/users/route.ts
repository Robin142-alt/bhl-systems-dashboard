import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { buildUserScope, ensureScopedUserByEmail } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await ensureScopedUserByEmail(session.user.email);

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      where: buildUserScope(currentUser.organizationId, currentUser.organizationSlug, {
        isActive: true,
      }),
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("[api/users] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
