import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DEFAULT_ORGANIZATION_SLUG = "primary-workspace";
export const DEFAULT_ORGANIZATION_NAME = "Primary Workspace";

export interface ScopedAppUser {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  organizationId: number;
  organizationName: string;
  organizationSlug: string;
}

interface UserWithOptionalOrganization {
  id: number;
  email: string;
  name: string | null;
  role: Role;
  organizationId: number | null;
  organization: {
    id: number;
    name: string;
    slug: string;
  } | null;
}

export async function ensureDefaultOrganization() {
  return prisma.organization.upsert({
    where: { slug: DEFAULT_ORGANIZATION_SLUG },
    update: {},
    create: {
      name: DEFAULT_ORGANIZATION_NAME,
      slug: DEFAULT_ORGANIZATION_SLUG,
    },
  });
}

function toScopedAppUser(
  user: UserWithOptionalOrganization,
  organization: {
    id: number;
    name: string;
    slug: string;
  },
): ScopedAppUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: organization.id,
    organizationName: organization.name,
    organizationSlug: organization.slug,
  };
}

async function attachUserToDefaultOrganization(user: UserWithOptionalOrganization) {
  const organization = await ensureDefaultOrganization();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      organizationId: organization.id,
    },
  });

  return toScopedAppUser(user, organization);
}

export async function ensureScopedUserByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  if (user.organizationId && user.organization) {
    return toScopedAppUser(user, user.organization);
  }

  return attachUserToDefaultOrganization(user);
}

export async function ensureUserInOrganization(
  userId: number,
  organizationId: number,
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      organizationId: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  if (user.organizationId && user.organizationId !== organizationId) {
    return null;
  }

  if (user.organizationId && user.organization) {
    return toScopedAppUser(user, user.organization);
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (!organization) {
    return null;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      organizationId: organization.id,
    },
  });

  return toScopedAppUser(user, organization);
}

export async function getOrCreateClientEntity(
  organizationId: number,
  clientName: string | null | undefined,
) {
  const normalizedName = typeof clientName === "string" ? clientName.trim() : "";

  if (!normalizedName) {
    return null;
  }

  const existing = await prisma.clientEntity.findFirst({
    where: {
      organizationId,
      name: {
        equals: normalizedName,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.clientEntity.create({
    data: {
      organizationId,
      name: normalizedName,
    },
    select: {
      id: true,
      name: true,
    },
  });
}

export function buildComplianceItemScope(
  organizationId: number,
  organizationSlug?: string,
  extraWhere: Prisma.ComplianceItemWhereInput = {},
): Prisma.ComplianceItemWhereInput {
  const includeLegacyUnscoped = organizationSlug === DEFAULT_ORGANIZATION_SLUG;
  const organizationScope: Prisma.ComplianceItemWhereInput = includeLegacyUnscoped
    ? {
        OR: [
          { organizationId },
          {
            organizationId: null,
            user: {
              is: {
                OR: [
                  { organizationId },
                  { organizationId: null },
                ],
              },
            },
          },
        ],
      }
    : { organizationId };

  return {
    AND: [organizationScope, extraWhere],
  };
}

export function buildTaskScope(
  organizationId: number,
  organizationSlug?: string,
  extraWhere: Prisma.TaskWhereInput = {},
): Prisma.TaskWhereInput {
  const includeLegacyUnscoped = organizationSlug === DEFAULT_ORGANIZATION_SLUG;
  const organizationScope: Prisma.TaskWhereInput = includeLegacyUnscoped
    ? {
        OR: [
          { organizationId },
          {
            organizationId: null,
            user: {
              is: {
                OR: [
                  { organizationId },
                  { organizationId: null },
                ],
              },
            },
          },
        ],
      }
    : { organizationId };

  return {
    AND: [organizationScope, extraWhere],
  };
}

export function buildWorkItemScope(
  organizationId: number,
  organizationSlug?: string,
  extraWhere: Prisma.WorkItemWhereInput = {},
): Prisma.WorkItemWhereInput {
  const includeLegacyUnscoped = organizationSlug === DEFAULT_ORGANIZATION_SLUG;
  const organizationScope: Prisma.WorkItemWhereInput = includeLegacyUnscoped
    ? {
        OR: [
          { organizationId },
          {
            organizationId: null,
            user: {
              is: {
                OR: [
                  { organizationId },
                  { organizationId: null },
                ],
              },
            },
          },
        ],
      }
    : { organizationId };

  return {
    AND: [organizationScope, extraWhere],
  };
}

export function buildUserScope(
  organizationId: number,
  organizationSlug?: string,
  extraWhere: Prisma.UserWhereInput = {},
): Prisma.UserWhereInput {
  const includeLegacyUnscoped = organizationSlug === DEFAULT_ORGANIZATION_SLUG;
  const organizationScope: Prisma.UserWhereInput = includeLegacyUnscoped
    ? {
        OR: [
          { organizationId },
          { organizationId: null },
        ],
      }
    : { organizationId };

  return {
    AND: [organizationScope, extraWhere],
  };
}
