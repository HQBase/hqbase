import { AppError, toAppError } from "@worker/lib/errors";
import { describe, expect, it } from "vitest";

describe("public errors", () => {
  it("keeps expected application errors and hides unexpected details", () => {
    const expected = new AppError("CONTACT_INVALID", "Contact email is invalid.", 400);
    expect(toAppError(expected)).toBe(expected);
    expect(toAppError(new Error("Failed query: SELECT secret FROM mail"))).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "An internal error occurred.",
      status: 500
    });
  });
});
