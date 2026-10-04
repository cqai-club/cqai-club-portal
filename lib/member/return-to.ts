export const MEMBER_APPLICATION_PATH = "/member/dashboard/application";
export const MEMBER_PROJECT_SUBMISSION_PATH = "/member/dashboard/project-submission";
export const MEMBER_RETURN_TO_HEADER = "x-cqai-member-return-to";

/** Only canonical, relative dashboard paths may be used after signing in. */
export function normalizeMemberReturnTo(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\u0000-\u0020\u007f\\]/.test(value) ||
    !/^\/member\/dashboard(?:\/[A-Za-z0-9_-]+)*\/?$/.test(value)
  ) {
    return undefined;
  }

  return value;
}

export function memberLoginPath(returnTo?: string, reauthenticate = false): string {
  const target = normalizeMemberReturnTo(returnTo);
  const params = new URLSearchParams();
  if (target) params.set("returnTo", target);
  if (reauthenticate) params.set("reauth", "1");
  return params.size ? `/member/login?${params}` : "/member/login";
}
