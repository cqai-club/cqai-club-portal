import { getLogtoContext } from "@/lib/logto";
import ProjectSubmissionManager from "./project-submission-manager";
import { innovationPageDenial } from "@/components/member/innovation-page-access";
import InnovationMembershipPrompt from "@/components/member/innovation-membership-prompt";

export const dynamic = "force-dynamic";

export default async function ProjectSubmissionPage() {
  const denial = await innovationPageDenial("/member/dashboard/project-submission", <InnovationMembershipPrompt section="projectSubmission" />);
  if (denial) return denial;
  const { claims } = await getLogtoContext();
  return <ProjectSubmissionManager initialOwner={typeof claims?.name === "string" ? claims.name : ""} />;
}
