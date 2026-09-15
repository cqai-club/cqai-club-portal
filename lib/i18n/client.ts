"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  defaultLang,
  LANGUAGE_STORAGE_KEY,
  readStoredLanguage,
  saveLanguage,
  t,
  type Language,
} from "./index";

const LANGUAGE_CHANGED_EVENT = "account-center-language-changed";

function subscribeToLanguage(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onLanguageChanged = () => onStoreChange();
  const onStorage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_STORAGE_KEY) {
      onStoreChange();
    }
  };

  window.addEventListener(LANGUAGE_CHANGED_EVENT, onLanguageChanged);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(LANGUAGE_CHANGED_EVENT, onLanguageChanged);
    window.removeEventListener("storage", onStorage);
  };
}

const getLanguageSnapshot = (): Language => readStoredLanguage();
const getServerLanguageSnapshot = (): Language => defaultLang;

export function useTranslations() {
  // React uses the server snapshot for SSR and the hydration pass, then reads
  // localStorage through the client snapshot once hydration has completed.
  const language = useSyncExternalStore(
    subscribeToLanguage,
    getLanguageSnapshot,
    getServerLanguageSnapshot
  );

  const setLanguage = useCallback((nextLanguage: Language) => {
    saveLanguage(nextLanguage);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGED_EVENT, { detail: nextLanguage }));
    }
  }, []);

  const translate = useCallback(
    (key: string, params?: Record<string, string>) => t(key, language, params),
    [language]
  );

  return useMemo(
    () => ({ t: translate, language, setLanguage }),
    [translate, language, setLanguage]
  );
}
