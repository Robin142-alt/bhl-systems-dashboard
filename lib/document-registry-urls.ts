export function buildDocumentDownloadUrl(
  documentId: number,
  documentVersionId?: number | null,
) {
  const versionQuery =
    typeof documentVersionId === "number" ? `?version=${documentVersionId}` : "";
  return `/api/documents/${documentId}/download${versionQuery}`;
}

export function parseDocumentDownloadUrl(fileUrl: string) {
  const match = fileUrl.match(/^\/api\/documents\/(\d+)\/download(?:\?(.+))?$/);
  if (!match) {
    return null;
  }

  const documentId = Number(match[1]);
  if (!Number.isFinite(documentId)) {
    return null;
  }

  const params = new URLSearchParams(match[2] || "");
  const rawVersion = params.get("version");
  const documentVersionId =
    rawVersion && Number.isFinite(Number(rawVersion)) ? Number(rawVersion) : null;

  return {
    documentId,
    documentVersionId,
  };
}

