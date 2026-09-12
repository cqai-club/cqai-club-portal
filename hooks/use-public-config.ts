"use client";

import { useFetch } from "@/hooks/use-fetch";
import type { PublicRuntimeConfig } from "@/config/types";

export function usePublicConfig() {
  return useFetch<PublicRuntimeConfig>({
    url: "/member/api/public-config",
    immediate: true,
  });
}
