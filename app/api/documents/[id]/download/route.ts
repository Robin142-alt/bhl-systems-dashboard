import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { resolveDocumentVersionBinary } from "@/lib/document-registry";
import { ensureScopedUserByEmail } from "@/lib/organizations";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Sign in before opening documents." }, { status: 401 });
    }

    const currentUser = await ensureScopedUserByEmail(session.user.email);

    if (!currentUser) {
      return NextResponse.json({ error: "Sign in before opening documents." }, { status: 401 });
    }

    const { id } = await params;
    const documentId = Number(id);
    const versionParam = new URL(request.url).searchParams.get("version");
    const documentVersionId =
      versionParam && Number.isFinite(Number(versionParam)) ? Number(versionParam) : null;

    if (!Number.isFinite(documentId)) {
      return NextResponse.json({ error: "Invalid document id." }, { status: 400 });
    }

    const resolved = await resolveDocumentVersionBinary({
      documentId,
      documentVersionId,
    });

    if (!resolved) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const sameOrganization =
      resolved.version.document.organizationId !== null &&
      resolved.version.document.organizationId === currentUser.organizationId;
    const isOwner =
      resolved.version.document.ownerUserId !== null &&
      resolved.version.document.ownerUserId === currentUser.id;

    if (!sameOrganization && !isOwner) {
      return NextResponse.json({ error: "You do not have access to this document." }, { status: 403 });
    }

    return new NextResponse(new Uint8Array(resolved.buffer), {
      headers: {
        "Content-Type": resolved.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(resolved.fileName)}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[documents] Download failed:", error);
    return NextResponse.json({ error: "Document download failed." }, { status: 500 });
  }
}

