export interface ApplicationStatus {
  reviewStatus: string;
  membershipState: string;
  membershipActive?: boolean | null;
}
export function applicationStatusKey(application: ApplicationStatus): string {
  if (application.reviewStatus === "rejected") return "rejected";
  if (application.reviewStatus !== "approved") return "pending";
  if (application.membershipActive === true) return "joined";
  if (application.membershipState === "joined") return application.membershipActive === false ? "inactive" : "unknown";
  if (application.membershipState === "failed") return "failed";
  if (application.membershipState === "unknown") return "unknown";
  return "processing";
}
