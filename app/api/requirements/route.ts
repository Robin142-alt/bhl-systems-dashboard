import { NextResponse } from "next/server";
import { ensureDefaultOrganization, ensureUserInOrganization } from "@/lib/organizations";
import { createWorkItem, hydrateWorkItem } from "@/lib/work-items";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, category, officer, dueDate, frequency, userId } = body;

    const fallbackOrganization = await ensureDefaultOrganization();
    const assignedUser = await ensureUserInOrganization(
      Number(userId) || 1,
      fallbackOrganization.id,
    );

    if (!assignedUser) {
      return NextResponse.json(
        { error: "Assigned user not found" },
        { status: 404 },
      );
    }

    const newRequirement = await createWorkItem({
      title: name,
      category,
      responsible: officer || assignedUser.name || assignedUser.email,
      deadline: new Date(dueDate),
      frequency: frequency ?? "MONTHLY",
      remindDaysBefore: 7,
      organizationId: assignedUser.organizationId,
      userId: assignedUser.id,
    });

    return NextResponse.json(hydrateWorkItem(newRequirement), { status: 201 });

  } catch (error) {
    console.error("Database Error:", error);
    return NextResponse.json(
      { error: "Failed to create requirement" },
      { status: 500 }
    );
  }
}
