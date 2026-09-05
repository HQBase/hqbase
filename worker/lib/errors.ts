export type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  let cause = error;
  for (let depth = 0; depth < 5 && cause instanceof Error; depth += 1) {
    if (cause.message.includes("draft send is pending")) {
      return new AppError(
        "DRAFT_SEND_PENDING",
        "This draft has a pending or uncertain delivery. Do not send another copy.",
        409
      );
    }
    if (cause.message.includes("draft was removed before send")) {
      return new AppError("DRAFT_CONFLICT", "The draft was removed before sending.", 409);
    }
    cause = cause.cause;
  }
  return new AppError("INTERNAL_ERROR", "An internal error occurred.", 500);
}
