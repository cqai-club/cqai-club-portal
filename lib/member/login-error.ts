import { LogtoClientError, LogtoError, LogtoRequestError } from "@logto/next";

export type MemberLoginError = "authorization-failed" | "invalid-session";

export function normalizeMemberLoginError(value: unknown): MemberLoginError | undefined {
  return value === "authorization-failed" || value === "invalid-session" ? value : undefined;
}

type LoginFailure = {
  reason: MemberLoginError;
  code: string;
  name: "LogtoClientError" | "LogtoError" | "LogtoRequestError";
};

/** Handle explicit SDK login failures while leaving redirect control flow alone. */
export function classifyMemberLoginError(error: unknown): LoginFailure | undefined {
  if (error instanceof LogtoRequestError && error.code === "oidc.invalid_grant") {
    return { reason: "authorization-failed", code: "oidc.invalid_grant", name: "LogtoRequestError" };
  }

  if (error instanceof LogtoClientError) {
    if (error.code === "sign_in_session.invalid" || error.code === "sign_in_session.not_found") {
      return { reason: "invalid-session", code: error.code, name: "LogtoClientError" };
    }
    return undefined;
  }

  if (error instanceof LogtoError) {
    switch (error.code) {
      case "callback_uri_verification.error_found":
        return { reason: "authorization-failed", code: error.code, name: "LogtoError" };
      case "callback_uri_verification.redirect_uri_mismatched":
      case "callback_uri_verification.missing_state":
      case "callback_uri_verification.state_mismatched":
      case "callback_uri_verification.missing_code":
        return { reason: "invalid-session", code: error.code, name: "LogtoError" };
    }
  }

  return undefined;
}

export function memberLoginErrorRequestId(error: unknown): string | undefined {
  if (!(error instanceof LogtoRequestError)) return undefined;
  const requestId = error.cause?.headers.get("logto-core-request-id");
  // Read only the diagnostic identifier, never the token response body.
  return requestId && requestId.length <= 128 && !/[^A-Za-z0-9_-]/.test(requestId)
    ? requestId
    : undefined;
}
