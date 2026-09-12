/**
 * 简单国际化 (i18n) 方案
 * 当前支持中文和 English
 */

import { zh } from "./zh";
import { en } from "./en";

export const translations = {
  zh,
  en,
} as const;

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof zh;

export const LANGUAGE_STORAGE_KEY = "account-center-language";
export const defaultLang: Language = "zh";

const localeToLangMap: Record<string, Language> = {
  "zh": "zh",
  "zh-CN": "zh",
  "zh-TW": "zh",
  "en": "en",
  "en-US": "en",
  "en-GB": "en",
};

export function normalizeLocale(input?: string | null): Language {
  if (!input) {
    return defaultLang;
  }

  const exact = localeToLangMap[input];
  if (exact) {
    return exact;
  }

  const byPrefix = Object.entries(localeToLangMap).find(([key]) => input.startsWith(`${key}-`));
  if (byPrefix) {
    return byPrefix[1];
  }

  return defaultLang;
}

export function readStoredLanguage(): Language {
  if (typeof window === "undefined") {
    return defaultLang;
  }

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored) {
    return normalizeLocale(stored);
  }

  const preferred = Array.isArray(window.navigator.languages)
    ? window.navigator.languages.find(Boolean)
    : window.navigator.language;

  const detected = normalizeLocale(preferred);
  saveLanguage(detected);
  return detected;
}

export function saveLanguage(language: Language): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

/**
 * 获取翻译
 */
export function t(
  key: string,
  language: Language = defaultLang,
  params?: Record<string, string>
): string {
  const translation = translations[language] ?? translations[defaultLang];

  // 支持嵌套路径，如 "common.save"
  const value = key.split(".").reduce<unknown>((obj, k) => {
    if (obj && typeof obj === "object" && k in obj) {
      return (obj as Record<string, unknown>)[k];
    }
    return undefined;
  }, translation);

  let result = typeof value === "string" ? value : key;

  // 替换参数
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      result = result.replace(new RegExp(`{${k}}`, "g"), v);
    });
  }

  return result;
}
