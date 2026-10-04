export interface OrganizationBinding {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string | null;
  validatedAt: string | null;
  revision: number;
}
export interface OrganizationUser {
  id: string;
  name: string | null;
  username: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  inOrganization?: boolean;
  joinedAt?: string | null;
}
export interface OrganizationUserPage {
  data: OrganizationUser[];
  total: number | null;
  page: number;
  hasNext: boolean;
}
export interface MemberJoinResult {
  userId: string;
  state: "joined" | "failed" | "unknown";
  error?: string;
}
