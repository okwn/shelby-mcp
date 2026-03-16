export function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

export function parseCommaSeparatedList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  ];
}

export function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  return Object.fromEntries(entries) as T;
}

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      offset?: unknown;
    };
    if (typeof parsed.offset !== "number" || Number.isNaN(parsed.offset) || parsed.offset < 0) {
      throw new Error("Cursor offset must be a non-negative number.");
    }
    return parsed.offset;
  } catch (error) {
    throw new Error(`Invalid cursor: ${(error as Error).message}`, {
      cause: error
    });
  }
}

export function isTextLikeContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return false;
  }

  return (
    contentType.startsWith("text/") ||
    contentType === "application/json" ||
    contentType === "application/xml" ||
    contentType === "application/javascript" ||
    contentType.endsWith("+json") ||
    contentType.endsWith("+xml")
  );
}

export function toIsoDate(value: Date = new Date()): string {
  return value.toISOString();
}
