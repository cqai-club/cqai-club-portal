/**
 * Logto 客户端方法封装
 * 基于 @logto/next 的 Server Actions
 */

import {
  getLogtoContext as _getLogtoContext,
  signIn as _signIn,
  signOut as _signOut,
  getAccessTokenRSC as _getAccessTokenRSC,
  handleSignIn as _handleSignIn,
} from "@logto/next/server-actions";
import { Prompt } from "@logto/next";

import { logtoConfig } from "./config";
import { logger } from "@/lib/logger";

type LogtoContext = Awaited<ReturnType<typeof _getLogtoContext>>;

/**
 * 获取 Logto 上下文（认证状态）
 */
export async function getLogtoContext(resource?: string): Promise<LogtoContext> {
  const context = await _getLogtoContext(
    logtoConfig,
    resource ? { getAccessToken: true, resource } : undefined
  );

  if (resource && !context.isAuthenticated) {
    const sessionContext = await _getLogtoContext(logtoConfig);
    if (sessionContext.isAuthenticated) {
      try {
        await _getAccessTokenRSC(logtoConfig, resource);
        logger.error("Logto resource context failed but direct token retry succeeded", {
          resource,
          isAuthenticated: context.isAuthenticated,
        });
      } catch (error) {
        const details = error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              code: "code" in error ? error.code : undefined,
              data: "data" in error ? error.data : undefined,
            }
          : { message: String(error) };
        logger.error("Logto resource access token acquisition failed", {
          resource,
          isAuthenticated: context.isAuthenticated,
          error: details,
        });
      }
    }
  }

  if (!context.isAuthenticated) {
    return context;
  }

  // A resource-scoped token is used for permission checks. It is not an
  // account API token, so do not send it to Logto's /api/my-account endpoint.
  if (resource) {
    if (!context.accessToken) {
      return {
        ...context,
        isAuthenticated: false,
      };
    }
    return context;
  }

  // Keep the normal page session check independent from API-resource token
  // refreshes. Account APIs perform their own access-token validation.
  return context;
}

/**
 * 登录。`redirectUri` 不为空时作为显式回调地址传给 Logto（覆盖默认
 * `${baseUrl}/callback`），用于把回调固定在 /member 前缀下。
 */
export const signIn = (redirectUri?: string) =>
  _signIn(logtoConfig, {
    redirectUri: redirectUri ?? `${logtoConfig.baseUrl}/callback`,
    prompt: Prompt.Login,
    clearTokens: true,
  });

/**
 * 登出
 */
export const signOut = () => _signOut(logtoConfig, process.env.HOME_URL );

/**
 * 处理登录回调。
 *
 */
export const handleSignIn = (callbackUrl: URLSearchParams) =>
  _handleSignIn(logtoConfig, callbackUrl);

/**
 * 获取 Access Token (RSC)
 */
export const getAccessTokenRSC = () => _getAccessTokenRSC(logtoConfig);

/**
 * 获取带认证的请求头
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const accessToken = await getAccessTokenRSC();
  return {
    authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}
