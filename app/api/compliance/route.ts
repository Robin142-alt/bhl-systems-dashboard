import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  canApproveRole,
} from "@/lib/compliance-workflow";
import {
  ensureScopedUserByEmail,
  ensureUserInOrganization,
  getOrCreateClientEntity,
} from "@/lib/organizations";
import {
  createWorkItem,
  hydrateWorkItem,
  listHydratedWorkItems,
} from "@/lib/work-items";

async function getCurrentUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return null;
  }

  return ensureScopedUserByEmail(session.user.email);
}

export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const response = await listHydratedWorkItems({
      organizationId: currentUser.organizationId,
      organizationSlug: currentUser.organizationSlug,
      userId: currentUser.id,
      canManage: canApproveRole(currentUser.role),
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/compliance] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (!body.title || !body.deadline) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const assignedUserId =
      typeof body.userId === "number" && body.userId > 0 ? body.userId : currentUser.id;

    const assignedUser = await ensureUserInOrganization(
      assignedUserId,
      currentUser.organizationId,
    );

    if (!assignedUser) {
      return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
    }

    const responsible =
      typeof body.responsible === "string" && body.responsible.trim().length > 0
        ? body.responsible.trim()
        : assignedUser.name || assignedUser.email;

    const clientEntity = await getOrCreateClientEntity(
      currentUser.organizationId,
      typeof body.clientName === "string" ? body.clientName : "",
    );

    const newItem = await createWorkItem({
      title: body.title,
      deadline: new Date(body.deadline),
      frequency: body.frequency || "Monthly",
      responsible,
      category: body.category || "General",
      remindDaysBefore: Number(body.remindDaysBefore) || 7,
      organizationId: currentUser.organizationId,
      clientEntityId: clientEntity?.id,
      userId: assignedUser.id,
      createdBy: currentUser,
    });

    return NextResponse.json(hydrateWorkItem(newItem), { status: 201 });
  } catch (error) {
    console.error("[api/compliance] POST failed:", error);
    return NextResponse.json({ error: "Failed to save requirement" }, { status: 500 });
  }
}
