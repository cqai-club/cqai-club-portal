import type {
  FeaturesConfig,
  ProfileFieldConfig,
  ProfileFieldsConfig,
} from "@/config/types";
import {
  getEnabledProfileFields as getEnabledProfileFieldsFromConfig,
  isFeatureEnabled as isFeatureEnabledFromConfig,
} from "@/lib/config/feature-helpers";
import { features, profileFields } from "@/lib/config/runtime-config";

export { features, profileFields };

export function isFeatureEnabled<K extends keyof FeaturesConfig>(
  featureKey: K,
  subFeatureKey?: string
): boolean {
  return isFeatureEnabledFromConfig(features, featureKey, subFeatureKey);
}

export function getEnabledProfileFields(): Array<{
  key: keyof ProfileFieldsConfig;
  config: ProfileFieldConfig;
}> {
  return getEnabledProfileFieldsFromConfig(profileFields);
}
