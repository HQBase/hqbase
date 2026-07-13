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

  if (error instanceof Error) {
    return new AppError("INTERNAL_ERROR", error.message, 500);
  }

  return new AppError("INTERNAL_ERROR", "Unexpected error.", 500);
}
