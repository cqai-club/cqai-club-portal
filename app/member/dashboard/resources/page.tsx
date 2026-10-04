import ResourceCenter from "@/components/member/resource-center";
import InnovationMembershipPrompt from "@/components/member/innovation-membership-prompt";
import { innovationPageDenial } from "@/components/member/innovation-page-access";
export const dynamic = "force-dynamic";
export default async function ResourcesPage() {
  const denial = await innovationPageDenial("/member/dashboard/resources", <InnovationMembershipPrompt section="resources" />);
  return denial || <ResourceCenter />;
}
