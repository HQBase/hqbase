export type RecentAuthenticationState = {
  authentication: "checking" | "recent" | "stale";
  password: string;
  pending: boolean;
  authenticationError: string | null;
  continuationError: string | null;
};

export const initialRecentAuthenticationState: RecentAuthenticationState = {
  authentication: "checking",
  password: "",
  pending: false,
  authenticationError: null,
  continuationError: null
};

export type RecentAuthenticationAction =
  | { type: "check-started" }
  | { type: "check-finished"; recent: boolean }
  | { type: "check-failed"; message: string }
  | { type: "password-changed"; password: string }
  | { type: "submit-started" }
  | { type: "authentication-failed"; message: string }
  | { type: "authenticated" }
  | { type: "continuation-failed"; message: string };

export function recentAuthenticationReducer(
  state: RecentAuthenticationState,
  action: RecentAuthenticationAction
): RecentAuthenticationState {
  switch (action.type) {
    case "check-started":
      return initialRecentAuthenticationState;
    case "check-finished":
      return { ...state, authentication: action.recent ? "recent" : "stale" };
    case "check-failed":
      return { ...state, authentication: "stale", authenticationError: action.message };
    case "password-changed":
      return { ...state, password: action.password };
    case "submit-started":
      return {
        ...state,
        pending: true,
        authenticationError: null,
        continuationError: null
      };
    case "authentication-failed":
      return {
        ...state,
        authentication: "stale",
        pending: false,
        authenticationError: action.message
      };
    case "authenticated":
      return {
        authentication: "recent",
        password: "",
        pending: false,
        authenticationError: null,
        continuationError: null
      };
    case "continuation-failed":
      return {
        ...state,
        authentication: "recent",
        pending: false,
        continuationError: action.message
      };
  }
}
