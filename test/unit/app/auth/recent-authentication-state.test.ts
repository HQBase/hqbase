import { describe, expect, it } from "vitest";
import {
  initialRecentAuthenticationState,
  recentAuthenticationReducer
} from "@/features/auth/recent-authentication-state";

describe("recent authentication state", () => {
  it("clears the password and pending state when authentication succeeds", () => {
    const state = {
      ...initialRecentAuthenticationState,
      authentication: "stale" as const,
      password: "correct-password",
      pending: true,
      authenticationError: "old authentication error",
      continuationError: "old continuation error"
    };

    expect(recentAuthenticationReducer(state, { type: "authenticated" })).toEqual({
      authentication: "recent",
      password: "",
      pending: false,
      authenticationError: null,
      continuationError: null
    });
  });
});
