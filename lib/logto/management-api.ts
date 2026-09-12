/**
 * Logto Management API 封装
 * 需要 M2M (Machine-to-Machine) Token
 */

import { createManagementApi } from "@logto/api/management";
import { logger } from "@/lib/logger";
import { logtoConfig, managementAPIConfig } from "./config";
import { features } from "@/config/features";
import { getAccessTokenRSC, getLogtoContext } from "./client";
import {
  fetchWithAuth,
  fetchJsonWithAuth,
  fetchVoidWithAuth,
} from "./fetch-with-auth";
import type {
  AllIdentitiesResponse,
  SocialConnector,
  LoginHistoryRecord,
  LogtoRawSession,
  SessionInfo,
} from "./types";

/**
 * 获取 Management API 上下文
 */
async function getManagementContext() {
  const { apiClient, clientCredentials } = createManagementApi("default", {
    clientId: managementAPIConfig.clientId,
    clientSecret: managementAPIConfig.clientSecret,
    baseUrl: managementAPIConfig.logtoEndpoint,
    apiIndicator: "https://default.logto.app/api",
  });

  const accessToken = (await clientCredentials.getAccessToken()).value;
  const { claims } = await getLogtoContext();
  const userId = claims?.sub;

  if (!userId) {
    throw new Error("User ID is missing in token claims");
  }

  return { accessToken, userId, apiClient };
}

/**
 * 设置密码
 */
export async function setPassword(password: string): Promise<void> {
  const { accessToken, userId } = await getManagementContext();

  logger.devLog("Setting password", { userId });

  // PATCH /password returns 204 No Content — use fetchVoidWithAuth to avoid
  // calling res.json() on an empty body.
  return fetchVoidWithAuth({
    url: `${logtoConfig.endpoint}/api/users/${userId}/password`,
    accessToken,
    method: "PATCH",
    body: { password },
    operationName: "密码设置",
  });
}

/**
 * 验证密码
 */
export async function verifyPasswordManagement(password: string): Promise<{ success: boolean; message?: string }> {
  const { accessToken, userId } = await getManagementContext();

  const res = await fetchWithAuth({
    url: `${logtoConfig.endpoint}/api/users/${userId}/password/verify`,
    accessToken,
    method: "POST",
    body: { password },
    operationName: "密码验证",
  });

  if (res.status === 204) {
    return { success: true };
  }

  try {
    return await res.json();
  } catch {
    return { success: false, message: "Unknown error" };
  }
}

/**
 * 获取所有身份（社交 + SSO）
 */
export async function getAllIdentities(): Promise<AllIdentitiesResponse> {
  const { apiClient, userId } = await getManagementContext();

  const res = await apiClient.GET("/api/users/{userId}/all-identities", {
    params: { path: { userId } },
  });

  return (res.data as AllIdentitiesResponse) ?? { socialIdentities: [], ssoIdentities: [] };
}

// ============ Social Connectors ============

function toDisplayNameFromTarget(target: string): string {
  return target
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * 获取配置的社交连接器
 */
export function getSocialConnectors(): SocialConnector[] {
  const configuredConnectors = features.socialIdentities.config?.connectors;

  if (!configuredConnectors || configuredConnectors.length === 0) {
    return [];
  }

  return configuredConnectors
    .filter((connector) => connector.enabled)
    .map((connector) => ({
      target: connector.target,
      connectorId: connector.connectorId,
      name: connector.displayName ?? toDisplayNameFromTarget(connector.target),
      icon: connector.icon,
      description: connector.description,
    }));
}

export function getSocialConnectorByTarget(target: string): SocialConnector | undefined {
  return getSocialConnectors().find((connector) => connector.target === target);
}

/**
 * 获取社交身份（带错误处理）
 */
export async function getSocialIdentities(): Promise<AllIdentitiesResponse> {
  try {
    const identities = await getAllIdentities();
    logger.devLog("Fetched social identities", { count: identities.socialIdentities?.length });
    return identities;
  } catch (error) {
    logger.error("Failed to get social identities", error);
    return { socialIdentities: [], ssoIdentities: [] };
  }
}

// ============ Social Connection Flow ============

/**
 * 创建社交验证
 */
export async function createSocialVerification(
  connectorId: string,
  state: string,
  redirectUri: string
): Promise<{
  verificationRecordId: string;
  authorizationUri: string;
  expiresAt: string;
}> {
  const accessToken = await getAccessTokenRSC();

  logger.devLog("Creating social verification", { connectorId, state, redirectUri });

  return fetchJsonWithAuth({
    url: `${logtoConfig.endpoint}/api/verifications/social`,
    accessToken,
    method: "POST",
    body: { state, redirectUri, connectorId },
    operationName: "社交验证创建",
  });
}

/**
 * 验证社交连接
 */
export async function verifySocialVerification(
  verificationRecordId: string,
  connectorData: Record<string, unknown>
): Promise<{ verificationRecordId: string; expiresAt: string }> {
  const accessToken = await getAccessTokenRSC();

  logger.devLog("Verifying social verification", { verificationRecordId });

  return fetchJsonWithAuth({
    url: `${logtoConfig.endpoint}/api/verifications/social/verify`,
    accessToken,
    method: "POST",
    body: { verificationRecordId, connectorData },
    operationName: "社交验证",
  });
}

/**
 * 添加社交身份（通过验证记录）
 */
export async function addSocialIdentity(
  verificationRecordId: string,
  identityVerificationId?: string
): Promise<{ success: true }> {
  const accessToken = await getAccessTokenRSC();

  logger.devLog("Adding social identity", { verificationRecordId });

  await fetchVoidWithAuth({
    url: `${logtoConfig.endpoint}/api/my-account/identities`,
    accessToken,
    method: "POST",
    body: { newIdentifierVerificationRecordId: verificationRecordId },
    headers: identityVerificationId
      ? { "logto-verification-id": identityVerificationId }
      : {},
    operationName: "添加社交身份",
  });

  return { success: true };
}

/**
 * 移除社交身份
 */
export async function removeSocialIdentity(target: string): Promise<{ success: true }> {
  const accessToken = await getAccessTokenRSC();

  await fetchVoidWithAuth({
    url: `${logtoConfig.endpoint}/api/my-account/identities/${encodeURIComponent(target)}`,
    accessToken,
    method: "DELETE",
    operationName: "移除社交身份",
  });

  return { success: true };
}

/**
 * 移除社交身份（可选身份验证头）
 */
export async function removeSocialIdentityWithVerification(
  target: string,
  identityVerificationId?: string
): Promise<{ success: true }> {
  const accessToken = await getAccessTokenRSC();

  await fetchVoidWithAuth({
    url: `${logtoConfig.endpoint}/api/my-account/identities/${encodeURIComponent(target)}`,
    accessToken,
    method: "DELETE",
    headers: identityVerificationId
      ? { "logto-verification-id": identityVerificationId }
      : {},
    operationName: "移除社交身份",
  });

  return { success: true };
}

// ============ Login History ============

/**
 * Logto log key → 人类可读标签的映射
 * Logto logs API 返回的 key 字段值（如 Interaction.SignIn.Submit）
 */
const LOG_KEY_LABELS: Record<string, string> = {
  // Sign-In
  "Interaction.SignIn.Submit": "登录",
  "Interaction.SignIn.Create": "发起登录",
  "Interaction.SignIn.Identifier.Password.Submit": "密码登录",
  "Interaction.SignIn.Identifier.VerificationCode.Submit": "验证码登录",
  "Interaction.SignIn.Identifier.Social.Submit": "社交账号登录",
  "Interaction.SignIn.Identifier.SingleSignOn.Submit": "SSO 登录",
  "Interaction.SignIn.Verification.Totp.Submit": "TOTP 验证",
  "Interaction.SignIn.Verification.WebAuthn.Submit": "WebAuthn 验证",
  "Interaction.SignIn.Verification.BackupCode.Submit": "备用码验证",
  "Interaction.SignIn.Verification.SignInPasskey.Submit": "通行密钥登录",
  // Register
  "Interaction.Register.Submit": "注册",
  "Interaction.Register.Create": "发起注册",
  // Token Exchange
  "ExchangeTokenBy.AuthorizationCode": "授权码换Token",
  "ExchangeTokenBy.RefreshToken": "刷新Token",
  "ExchangeTokenBy.ClientCredentials": "客户端凭据",
  "ExchangeTokenBy.TokenExchange": "Token交换",
  // Interaction
  "Interaction.Create": "交互开始",
  "Interaction.End": "交互结束",
  // Forgot Password
  "Interaction.ForgotPassword.Submit": "重置密码",
};

/**
 * 从 Logto log key 提取中文标签
 */
function getLogKeyLabel(key: string): string {
  if (LOG_KEY_LABELS[key]) return LOG_KEY_LABELS[key];

  // 前缀匹配：Interaction.SignIn.* → 登录相关
  if (key.startsWith("Interaction.SignIn")) return "登录";
  if (key.startsWith("Interaction.Register")) return "注册";
  if (key.startsWith("Interaction.ForgotPassword")) return "重置密码";
  if (key.startsWith("ExchangeTokenBy")) return "Token 交互";
  if (key.startsWith("Interaction.")) return "用户交互";

  return key;
}

/**
 * 应用名缓存（applicationId → name），进程级缓存避免重复请求
 */
let applicationNameCache: Map<string, string> | null = null;

/**
 * 获取所有应用并构建 id→name 映射
 */
async function getApplicationNameMap(): Promise<Map<string, string>> {
  if (applicationNameCache) return applicationNameCache;

  try {
    const { accessToken } = await getManagementContext();
    const res = await fetchWithAuth({
      url: `${logtoConfig.endpoint}/api/applications`,
      accessToken,
      operationName: "获取应用列表（用于日志解析）",
    });

    const apps = await res.json();
    const rawApps: Array<Record<string, unknown>> = Array.isArray(apps) ? apps : [];

    applicationNameCache = new Map<string, string>();
    for (const app of rawApps) {
      const id = typeof app.id === "string" ? app.id : "";
      const name = typeof app.name === "string" ? app.name : "";
      if (id && name) {
        applicationNameCache.set(id, name);
      }
    }
    return applicationNameCache;
  } catch (error) {
    logger.error("获取应用列表失败:", error);
    return new Map();
  }
}

function normalizeLogTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }

  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber > 10_000_000_000 ? asNumber : asNumber * 1000;
    }

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

/**
 * 检测是否为服务端发起的请求
 * 服务端请求的特征：User-Agent 包含 node, python, curl 等
 * 
 * 为什么会有服务端登录记录？
 * 1. 某些后端服务或脚本使用用户的身份令牌进行 API 调用
 * 2. 自动化测试或监控脚本
 * 3. 第三方集成服务（如 CI/CD、自动化工具）
 * 4. 这些请求虽然使用了用户的 token，但并非用户本人通过浏览器/客户端发起
 */
function isServerSideRequest(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  
  const serverSidePatterns = [
    /^node$/i,
    /^python/i,
    /^curl/i,
    /^wget/i,
    /^postman/i,
    /^http/i,
    /^go-http/i,
    /^java/i,
    /^okhttp/i,
    /^axios/i,
  ];
  
  return serverSidePatterns.some(pattern => pattern.test(userAgent.trim()));
}

/**
 * 获取用户登录记录
 * Logto logs API 返回字段：key (事件类型), payload.applicationId, payload.ip, payload.userAgent 等
 */
export async function getUserLoginHistory(): Promise<LoginHistoryRecord[]> {
  const { accessToken, userId } = await getManagementContext();

  // 并行获取日志和应用名映射
  const url = new URL(`${logtoConfig.endpoint}/api/logs`);
  url.searchParams.set("userId", userId);
  url.searchParams.set("pageSize", "20");

  const [res, appNameMap] = await Promise.all([
    fetchWithAuth({
      url: url.toString(),
      accessToken,
      operationName: "获取登录记录",
    }),
    getApplicationNameMap(),
  ]);

  const payload = await res.json();
  const rawLogs: Array<Record<string, unknown>> = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown }).data)
      ? (payload as { data: Array<Record<string, unknown>> }).data
      : [];

  return rawLogs
    .map((log): LoginHistoryRecord | null => {
      const payloadObj =
        log.payload && typeof log.payload === "object"
          ? (log.payload as Record<string, unknown>)
          : undefined;

      const timestamp =
        normalizeLogTimestamp(log.createdAt) ??
        normalizeLogTimestamp(log.created_at) ??
        normalizeLogTimestamp(log.timestamp) ??
        normalizeLogTimestamp(log.time);

      if (!timestamp) return null;

      // IP: payload.ip 优先
      const ip =
        typeof log.ip === "string"
          ? log.ip
          : typeof payloadObj?.ip === "string"
            ? payloadObj.ip
            : undefined;

      // User-Agent: payload.userAgent
      const rawUserAgent =
        typeof log.userAgent === "string"
          ? log.userAgent
          : typeof payloadObj?.userAgent === "string"
            ? payloadObj.userAgent
            : undefined;
      
      // 屏蔽服务端发起的请求记录
      if (isServerSideRequest(rawUserAgent)) {
        return null;
      }

      // 事件类型：Logto 用 `key` 字段，不是 `type`
      const logKey =
        typeof log.key === "string"
          ? log.key
          : typeof payloadObj?.key === "string"
            ? payloadObj.key
            : undefined;

      // 应用名：从 payload.applicationId 查询，Logto 不直接返回 applicationName
      const applicationId =
        typeof payloadObj?.applicationId === "string"
          ? payloadObj.applicationId
          : undefined;

      const applicationName = applicationId
        ? appNameMap.get(applicationId) ?? "未知应用"
        : "账户中心";

      // 事件结果
      const result =
        typeof payloadObj?.result === "string"
          ? payloadObj.result
          : undefined;

      const id =
        typeof log.id === "string" ? log.id : `${timestamp}-${logKey ?? "unknown"}`;

      return {
        id,
        event: logKey ?? "未知事件",
        eventLabel: getLogKeyLabel(logKey ?? ""),
        timestamp,
        applicationName,
        applicationId,
        ip,
        userAgent: rawUserAgent,
        result,
      };
    })
    .filter((record): record is LoginHistoryRecord => Boolean(record))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);
}

// ============ Session Management (Logto v1.38+) ============

/**
 * 获取用户的活跃会话列表
 * GET /api/users/{userId}/sessions
 */
export async function getUserActiveSessions(): Promise<SessionInfo[]> {
  const { accessToken, userId } = await getManagementContext();

  const res = await fetchWithAuth({
    url: `${logtoConfig.endpoint}/api/users/${userId}/sessions`,
    accessToken,
    operationName: "获取活跃会话",
  });

  const data = await res.json();

  // API may return { sessions: [...] } or a plain array
  const rawSessions: LogtoRawSession[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.sessions)
      ? data.sessions
      : [];

  // Determine current session's client ID from the access token context
  const { claims } = await getLogtoContext();
  const currentClientId = claims?.client_id as string | undefined;

  return rawSessions
    .map((session): SessionInfo => {
      const signInContext = session.lastSubmission?.signInContext;
      const verificationRecords = session.lastSubmission?.verificationRecords;
      const authMethod = verificationRecords?.[0]?.type;

      // Detect if this is the current session:
      // Match by client ID + approximate login time
      const isCurrent =
        currentClientId != null &&
        session.clientId === currentClientId &&
        claims?.auth_time != null &&
        Math.abs(session.payload.loginTs - (claims.auth_time as number)) < 5;

      return {
        id: session.payload.uid,
        isCurrent,
        loginAt: session.payload.loginTs > 10_000_000_000
          ? session.payload.loginTs
          : session.payload.loginTs * 1000,
        expiresAt: session.expiresAt > 10_000_000_000
          ? session.expiresAt
          : session.expiresAt * 1000,
        clientId: session.clientId,
        ip: signInContext?.ip,
        userAgent: signInContext?.userAgent,
        authMethod,
      };
    })
    .sort((a, b) => b.loginAt - a.loginAt);
}

/**
 * 撤销用户会话
 * DELETE /api/users/{userId}/sessions/{sessionId}
 */
export async function revokeUserSession(sessionId: string): Promise<void> {
  const { accessToken, userId } = await getManagementContext();

  await fetchVoidWithAuth({
    url: `${logtoConfig.endpoint}/api/users/${userId}/sessions/${encodeURIComponent(sessionId)}`,
    accessToken,
    method: "DELETE",
    operationName: "撤销会话",
  });
}

// ============ Account Deletion ============

/**
 * 删除用户账户
 */
export async function deleteUserAccount(userId?: string): Promise<{ success: true }> {
  const { accessToken, userId: currentUserId } = await getManagementContext();
  const targetUserId = userId ?? currentUserId;

  if (!targetUserId) {
    throw new Error("无法确定待删除的用户 ID");
  }

  await fetchVoidWithAuth({
    url: `${logtoConfig.endpoint}/api/users/${targetUserId}`,
    accessToken,
    method: "DELETE",
    operationName: "账户删除",
  });

  return { success: true };
}
