import { NextResponse } from "next/server";
import { getLogtoContext } from "@/lib/logto";
import { CQAI_API_RESOURCE } from "@/lib/logto/config";
import { logger } from "@/lib/logger";

export const PLUGIN_ADMIN_PERMISSION = "plugin:admin";
export const MEMBER_ADMIN_PERMISSION = "member:admin";

type PermissionContext = {
  isAuthenticated: boolean;
  scopes?: unknown;
};

export function hasApiPermission(
  scopes: unknown,
  requiredPermission: string
): boolean {
  return Array.isArray(scopes) && scopes.some(scope => scope === requiredPermission);
}

async function hasResourcePermission(requiredPermission: string): Promise<boolean> {
  try {
    const context = await getLogtoContext(CQAI_API_RESOURCE);
    const scopes = Array.isArray(context.scopes)
      ? context.scopes.filter((scope): scope is string => typeof scope === "string")
      : [];
    const granted = context.isAuthenticated && hasApiPermission(scopes, requiredPermission);
    logger.warn("Member-center resource permission debug", {
      resource: CQAI_API_RESOURCE,
      requiredPermission,
      isAuthenticated: context.isAuthenticated,
      scopes,
      granted,
    });
    return granted;
  } catch (error) {
    console.error("Member-center permission check failed:", error);
    return false;
  }
}

/** Check the resource-scoped member permission used by member admin pages. */
export function hasMemberAdminPermission(): Promise<boolean> {
  return hasResourcePermission(MEMBER_ADMIN_PERMISSION);
}

/** Check the resource-scoped plugin permission used by the plugin market. */
export function hasPluginAdminPermission(): Promise<boolean> {
  return hasResourcePermission(PLUGIN_ADMIN_PERMISSION);
}

/**
 * Protect member-center APIs with a scope granted on the CQAI API resource.
 * The old role and standalone admin-token checks are intentionally not used.
 */
export async function requireMemberAdminPermission(
  requiredPermission = MEMBER_ADMIN_PERMISSION
): Promise<NextResponse | null> {
  let context: PermissionContext;

  try {
    context = await getLogtoContext(CQAI_API_RESOURCE);
  } catch (error) {
    console.error("Member-center authorization check failed:", error);
    return NextResponse.json(
      { error: "请先登录会员中心。" },
      { status: 401 }
    );
  }

  if (!context.isAuthenticated) {
    logger.warn("Member-center resource permission debug", {
      resource: CQAI_API_RESOURCE,
      requiredPermission,
      isAuthenticated: false,
      scopes: [],
      granted: false,
    });
    return NextResponse.json(
      { error: "请先登录会员中心。" },
      { status: 401 }
    );
  }

  const scopes = Array.isArray(context.scopes)
    ? context.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  const granted = hasApiPermission(scopes, requiredPermission);
  logger.warn("Member-center resource permission debug", {
    resource: CQAI_API_RESOURCE,
    requiredPermission,
    isAuthenticated: true,
    scopes,
    granted,
  });

  if (!granted) {
    return NextResponse.json(
      { error: `您没有 ${requiredPermission} 权限。` },
      { status: 403 }
    );
  }

  return null;
}
