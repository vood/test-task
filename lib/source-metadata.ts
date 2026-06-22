import path from "node:path";

export type SourceMetadata = {
  path: string;
  extension: string;
  sizeBytes: number;
  documentDate: string | null;
  dateSource: string;
  filesystemCreatedAt: string;
  filesystemModifiedAt: string;
  createdAt: string;
  modifiedAt: string;
};

export function buildSourceMetadata(input: {
  path: string;
  content?: string;
  sizeBytes: number;
  birthtime: Date;
  mtime: Date;
}): SourceMetadata {
  const extension = path.extname(input.path).toLowerCase() || "none";
  const inferredDate = inferDocumentDate(input.path, input.content ?? "");
  const filesystemCreatedAt = input.birthtime.toISOString();
  const filesystemModifiedAt = input.mtime.toISOString();
  const documentDate = inferredDate?.date ?? null;

  return {
    path: input.path,
    extension,
    sizeBytes: input.sizeBytes,
    documentDate,
    dateSource: inferredDate?.source ?? "filesystem",
    filesystemCreatedAt,
    filesystemModifiedAt,
    createdAt: documentDate ?? filesystemCreatedAt,
    modifiedAt: documentDate ?? filesystemModifiedAt,
  };
}

function inferDocumentDate(filePath: string, content: string) {
  const emailDate = content.match(/^Date:\s*(.+)$/im)?.[1];
  if (emailDate) {
    const parsed = parseDate(emailDate);
    if (parsed) {
      return { date: parsed, source: "email Date header" };
    }
  }

  const completed = content.match(/^\s*-\s*\*\*Completed:\*\*\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)/im)?.[1];
  if (completed) {
    const parsed = parseDate(completed);
    if (parsed) {
      return { date: parsed, source: "interview Completed field" };
    }
  }

  const started = content.match(/^\s*-\s*\*\*Started:\*\*\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)/im)?.[1];
  if (started) {
    const parsed = parseDate(started);
    if (parsed) {
      return { date: parsed, source: "interview Started field" };
    }
  }

  const generated = content.match(/\bGenerated\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1];
  if (generated) {
    const parsed = parseDate(generated);
    if (parsed) {
      return { date: parsed, source: "generated date in document" };
    }
  }

  const exportWindow = content.match(/Export window:\s*(?:\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\s+\d{1,2})\s+to\s+(\d{4}-\d{2}-\d{2}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i)?.[1];
  if (exportWindow) {
    const parsed = parseDate(exportWindow);
    if (parsed) {
      return { date: parsed, source: "export window end" };
    }
  }

  const titleDate = content.match(/<title>[^<]*?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\bQ[1-4]\s+\d{4}\b|\b[A-Za-z]+\s+\d{4}\b)[^<]*<\/title>/i)?.[1];
  if (titleDate) {
    const parsed = parseDate(titleDate);
    if (parsed) {
      return { date: parsed, source: "HTML title" };
    }
  }

  const pathDate = filePath.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (pathDate) {
    return { date: `${pathDate[1]}-${pathDate[2]}-${pathDate[3]}T00:00:00.000Z`, source: "file path date" };
  }

  const pathMonth = filePath.match(/\b(q[1-4])-(20\d{2})\b/i)?.[0] ?? filePath.match(/\b([a-z]+)-(20\d{2})\b/i)?.[0];
  if (pathMonth) {
    const parsed = parseDate(pathMonth.replace(/-/g, " "));
    if (parsed) {
      return { date: parsed, source: "file path period" };
    }
  }

  return null;
}

function parseDate(value: string) {
  const normalized = value.trim();
  const quarter = normalized.match(/^Q([1-4])\s+(20\d{2})$/i);
  if (quarter) {
    const month = (Number(quarter[1]) - 1) * 3;
    return new Date(Date.UTC(Number(quarter[2]), month, 1)).toISOString();
  }

  const monthOnly = normalized.match(/^([A-Za-z]+)\s+(20\d{2})$/);
  if (monthOnly) {
    const parsed = new Date(`${monthOnly[1]} 1, ${monthOnly[2]} 00:00:00 UTC`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const monthDayYear = normalized.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2})$/);
  if (monthDayYear) {
    const parsed = new Date(`${monthDayYear[1]} ${monthDayYear[2]}, ${monthDayYear[3]} 00:00:00 UTC`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const isoLike = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (isoLike) {
    return new Date(`${isoLike[1]}T${isoLike[2] ?? "00:00"}:00.000Z`).toISOString();
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
