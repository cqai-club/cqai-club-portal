import { redirect } from "next/navigation";
import InnovationMembershipPrompt from "@/components/member/innovation-membership-prompt";
import { innovationPageDenial } from "@/components/member/innovation-page-access";

export const dynamic = "force-dynamic";

export default async function AiGatewayPage() {
  const denial = await innovationPageDenial(
    "/member/dashboard/ai-gateway",
    <InnovationMembershipPrompt section="aiGateway" />,
  );
  if (denial) return denial;

  redirect("https://relay.cqaiclub.asia/");
}
