import { redirect } from "next/navigation";
import { getLogtoContext } from "@/lib/logto";
import { hasMemberAdminPermission, hasProjectPublishPermission } from "@/lib/member/permissions";
import { ProjectPublishPermissionProvider } from "./project-permissions";

export const dynamic = "force-dynamic";

export default async function ProjectAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getLogtoContext();

  if (!isAuthenticated) redirect("/member/sign-in");
  if (!(await hasMemberAdminPermission())) redirect("/member/dashboard");
  const canPublish = await hasProjectPublishPermission();

  return (
    <ProjectPublishPermissionProvider canPublish={canPublish}>
      {children}
    </ProjectPublishPermissionProvider>
  );
}
