import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { OpsEventTopic } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { registerDocumentUpload } from "@/lib/document-registry";
import { enqueueOpsEvent, processOpsEventById } from "@/lib/ops-events";
import { ensureScopedUserByEmail } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: "Sign in before uploading files." }, { status: 401 });
    }

    const currentUser = await ensureScopedUserByEmail(session.user.email);

    if (!currentUser) {
      return NextResponse.json({ error: "Sign in before uploading files." }, { status: 401 });
    }

    const data = await req.formData();
    const file = data.get("file");
    const existingDocumentIdValue = data.get("documentId");
    const titleValue = data.get("title");
    const sourceTypeValue = data.get("sourceType");
    const folderValue = data.get("folder");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const existingDocumentId =
      typeof existingDocumentIdValue === "string" && existingDocumentIdValue.trim().length > 0
        ? Number(existingDocumentIdValue)
        : null;

    if (existingDocumentId !== null) {
      const existingDocument = await prisma.document.findFirst({
        where: {
          id: existingDocumentId,
          archivedAt: null,
          organizationId: currentUser.organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!existingDocument) {
        return NextResponse.json(
          { error: "The selected document version chain could not be found." },
          { status: 404 },
        );
      }
    }

    const registered = await registerDocumentUpload(prisma, {
      buffer,
      fileName: file.name,
      mimeType: file.type || null,
      folder: typeof folderValue === "string" ? folderValue : null,
      title: typeof titleValue === "string" ? titleValue : null,
      sourceType: typeof sourceTypeValue === "string" ? sourceTypeValue : "GENERAL",
      organizationId: currentUser.organizationId,
      ownerUserId: currentUser.id,
      uploadedById: currentUser.id,
      existingDocumentId,
    });

    const extractionEventId = await enqueueOpsEvent(prisma, {
      topic: OpsEventTopic.DOCUMENT_EXTRACTION_REQUESTED,
      dedupeKey: `extract:${registered.documentVersionId}`,
      organizationId: currentUser.organizationId,
      documentId: registered.documentId,
      documentVersionId: registered.documentVersionId,
    });
    await processOpsEventById(extractionEventId);

    return NextResponse.json({
      fileUrl: registered.fileUrl,
      fileName: registered.fileName,
      documentId: registered.documentId,
      documentVersionId: registered.documentVersionId,
      versionNumber: registered.versionNumber,
      extraction: registered.extraction,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed. The document registry could not save the file." },
      { status: 500 },
    );
  }
}

