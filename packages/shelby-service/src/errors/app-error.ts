import { ZodError } from "zod";
import type { SerializableError } from "../types/index.js";

export class AppError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function toSerializableError(error: unknown): SerializableError {
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_ERROR",
      message: "Input validation failed.",
      details: {
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      }
    };
  }

  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
    return {
      code: "FILE_NOT_FOUND",
      message: "The requested file was not found."
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "An unexpected internal error occurred."
  };
}
