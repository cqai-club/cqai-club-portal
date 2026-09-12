/**
 * Zod schemas for API validation
 */

import { z } from "zod";

// ============ Auth Schemas ============

export const PasswordUpdateSchema = z.object({
  currentPassword: z.string().min(1, "当前密码不能为空"),
  newPassword: z.string().min(8, "新密码至少8位"),
});

export type PasswordUpdateInput = z.infer<typeof PasswordUpdateSchema>;

// ============ Profile Schemas ============

export const ProfileUpdateSchema = z.object({
  username: z.string().min(1).optional(),
  name: z.string().optional(),
  avatar: z.string().url().nullable().optional(),
  customData: z.record(z.string(), z.unknown()).optional(),
});

export const ProfileDetailsUpdateSchema = z.object({
  familyName: z.string().optional(),
  givenName: z.string().optional(),
  middleName: z.string().optional(),
  nickname: z.string().optional(),
  preferredUsername: z.string().optional(),
  profile: z.string().url().optional(),
  website: z.string().url().optional(),
  gender: z.enum(["male", "female", "other", ""]).optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  zoneinfo: z.string().optional(),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
});

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;
export type ProfileDetailsUpdateInput = z.infer<typeof ProfileDetailsUpdateSchema>;

// ============ MFA Schemas ============

export const MfaBindSchema = z.object({
  type: z.enum(["Totp", "WebAuthn", "BackupCode"]),
  verificationRecordId: z.string(),
  secret: z.string().optional(),
  codes: z.array(z.string()).optional(),
});

export const MfaDeleteSchema = z.object({
  verificationId: z.string(),
  identityVerificationId: z.string(),
});

export type MfaBindInput = z.infer<typeof MfaBindSchema>;
export type MfaDeleteInput = z.infer<typeof MfaDeleteSchema>;

// ============ Email/Phone Schemas ============

export const EmailUpdateSchema = z.object({
  email: z.string().email("无效的邮箱地址"),
  identityVerificationId: z.string(),
  newEmailVerificationId: z.string(),
});

export const PhoneUpdateSchema = z.object({
  phone: z.string().regex(/^\+?[\d\s-]{8,}$/, "无效的手机号"),
  identityVerificationId: z.string(),
  newPhoneVerificationId: z.string(),
});

export type EmailUpdateInput = z.infer<typeof EmailUpdateSchema>;
export type PhoneUpdateInput = z.infer<typeof PhoneUpdateSchema>;

// ============ Social Identity Schemas ============

export const SocialConnectSchema = z.object({
  target: z.string().min(1),
});

export const SocialStartSchema = z.object({
  target: z.string().min(1),
});

export const SocialCompleteSchema = z.object({
  target: z.string().min(1),
  state: z.string().min(1),
  connectorData: z.record(z.string(), z.unknown()),
  identityVerificationId: z.string().min(1).optional(),
});

export const SocialUnlinkSchema = z.object({
  target: z.string(),
});

export type SocialConnectInput = z.infer<typeof SocialConnectSchema>;
export type SocialStartInput = z.infer<typeof SocialStartSchema>;
export type SocialCompleteInput = z.infer<typeof SocialCompleteSchema>;
export type SocialUnlinkInput = z.infer<typeof SocialUnlinkSchema>;

// ============ Session Schemas ============

export const SessionDeleteSchema = z.object({
  sessionId: z.string(),
});

export type SessionDeleteInput = z.infer<typeof SessionDeleteSchema>;

// ============ Account Deletion Schema ============

export const AccountDeleteSchema = z.object({
  password: z.string().min(1, "密码不能为空"),
  confirmation: z.literal("DELETE"),
});

export type AccountDeleteInput = z.infer<typeof AccountDeleteSchema>;

// ============ Security/Monitor Schemas ============

export const PasswordVerificationSchema = z.object({
  password: z.string().min(1, "密码不能为空"),
});

export const MfaVerificationPathSchema = z.object({
  verificationId: z.string().min(1, "缺少 MFA 验证器 ID"),
});

export const MfaVerificationHeaderSchema = z.object({
  verificationRecordId: z.string().min(1, "缺少验证记录 ID"),
});

export const MfaVerificationRenameSchema = z.object({
  name: z.string().min(1, "缺少名称参数"),
});

export const HealthCheckQuerySchema = z.object({
  groupName: z.string().min(1, "缺少 groupName 参数"),
  serviceName: z.string().min(1, "缺少 serviceName 参数"),
});

export type PasswordVerificationInput = z.infer<typeof PasswordVerificationSchema>;
export type MfaVerificationPathInput = z.infer<typeof MfaVerificationPathSchema>;
export type MfaVerificationHeaderInput = z.infer<typeof MfaVerificationHeaderSchema>;
export type MfaVerificationRenameInput = z.infer<typeof MfaVerificationRenameSchema>;
export type HealthCheckQueryInput = z.infer<typeof HealthCheckQuerySchema>;

// ============ API Response Schemas ============

export const ApiErrorResponseSchema = z.object({
  error: z.string(),
});

export const ApiSuccessResponseSchema = z.object({
  success: z.literal(true),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type ApiSuccessResponse = z.infer<typeof ApiSuccessResponseSchema>;
