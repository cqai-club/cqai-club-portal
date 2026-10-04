import { getLogtoContext } from "@/lib/logto";
import { innovationMemberPageAccess } from "@/lib/member/innovation-access";
import MembershipTypes from "./membership-types";

export const dynamic = "force-dynamic";

export default async function MembershipTypesPage() {
  const { claims } = await getLogtoContext();
  const access = await innovationMemberPageAccess();
  const phone = typeof claims?.phone_number === "string" ? claims.phone_number : "";
  return <MembershipTypes currentMembership={access === "allowed" ? "chuangxiang" : access === "denied" ? "ordinary" : null} initialIdentity={{
    name: typeof claims?.name === "string" ? claims.name : "",
    email: typeof claims?.email === "string" ? claims.email : "",
    phone: /^1[3-9]\d{9}$/.test(phone) ? phone : "",
  }} />;
}
