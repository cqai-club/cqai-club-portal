/**
 * Logto Account Center UI 工具函数
 * 文档: https://docs.logto.io/end-user-flows/account-settings/by-account-center-ui
 */

function resolveLogtoEndpoint(explicitEndpoint?: string): string | null {
  const endpoint = explicitEndpoint ?? process.env.NEXT_PUBLIC_LOGTO_ENDPOINT ?? process.env.LOGTO_ENDPOINT;
  const baseUrl = endpoint?.replace(/\/$/, "");

  return baseUrl || null;
}

/**
 * 生成 Account Center UI URL
 * @param path - 页面路径 (如 /account/email)
 * @param redirectPath - 完成后跳转回的页面路径 (可选，默认当前页面)
 * @returns 完整的 URL
 */
export function getAccountCenterUrl(path: string, redirectPath?: string, endpoint?: string): string | null {
  const baseUrl = resolveLogtoEndpoint(endpoint);
  if (!baseUrl) {
    return null;
  }

  const currentUrl = typeof window !== "undefined" ? window.location.href : "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const redirect = redirectPath
    ? `${origin}${redirectPath}`
    : currentUrl;

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const encodedRedirect = encodeURIComponent(redirect);

  return `${baseUrl}${cleanPath}?redirect=${encodedRedirect}`;
}

// 快捷方法
export const accountCenterUrls = {
  /** 更新邮箱 */
  email: (redirect?: string, endpoint?: string) => getAccountCenterUrl("/account/email", redirect, endpoint),
  /** 更新手机号 */
  phone: (redirect?: string, endpoint?: string) => getAccountCenterUrl("/account/phone", redirect, endpoint),
  /** 更新用户名 */
  username: (redirect?: string, endpoint?: string) => getAccountCenterUrl("/account/username", redirect, endpoint),
  /** 更新密码 */
  password: (redirect?: string, endpoint?: string) => getAccountCenterUrl("/account/password", redirect, endpoint),
  /** 设置 TOTP 验证器 */
  authenticatorApp: (redirect?: string, endpoint?: string) => getAccountCenterUrl("/account/authenticator-app", redirect, endpoint),
  /** 生成备份码 */
  generateBackupCodes: (redirect?: string, endpoint?: string) =>
    getAccountCenterUrl("/account/backup-codes/generate", redirect, endpoint),
  /** 管理备份码 */
  manageBackupCodes: (redirect?: string, endpoint?: string) =>
    getAccountCenterUrl("/account/backup-codes/manage", redirect, endpoint),
  /** 添加 Passkey */
  addPasskey: (redirect?: string, endpoint?: string) => getAccountCenterUrl("/account/passkey/add", redirect, endpoint),
  /** 管理 Passkey */
  managePasskey: (redirect?: string, endpoint?: string) =>
    getAccountCenterUrl("/account/passkey/manage", redirect, endpoint),
};

/**
 * 检查 URL 中是否有 show_success 参数
 * @returns 成功类型或 null
 */
export function getAccountCenterSuccessType(): string | null {
  if (typeof window === "undefined") return null;
  
  const params = new URLSearchParams(window.location.search);
  return params.get("show_success");
}

/**
 * 清除 URL 中的 show_success 参数（不刷新页面）
 */
export function clearAccountCenterSuccessParam(): void {
  if (typeof window === "undefined") return;
  
  const url = new URL(window.location.href);
  url.searchParams.delete("show_success");
  window.history.replaceState({}, "", url.toString());
}
