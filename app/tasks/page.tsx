import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import TasksBoardClient from "@/components/TasksBoardClient";
import {
  canApproveRole,
} from "@/lib/compliance-workflow";
import { buildUserScope, ensureScopedUserByEmail } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { listHydratedWorkItems } from "@/lib/work-items";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/login");
  }

  const currentUser = await ensureScopedUserByEmail(session.user.email);

  if (!currentUser) {
    redirect("/login");
  }

  const canManage = canApproveRole(currentUser.role);

  const [items, staff] = await Promise.all([
    listHydratedWorkItems({
      organizationId: currentUser.organizationId,
      organizationSlug: currentUser.organizationSlug,
      userId: currentUser.id,
      canManage,
    }),
    prisma.user.findMany({
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
    }),
  ]);

  const hydratedItems = items.map((item) => ({
      ...item,
      deadline: item.deadline.toISOString(),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
  }));

  return (
    <TasksBoardClient
      items={hydratedItems}
      staff={staff}
      currentUser={currentUser}
      canManage={canManage}
    />
  );
}
