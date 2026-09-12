import type {
  FeatureConfig,
  FeaturesConfig,
  ProfileFieldConfig,
  ProfileFieldsConfig,
} from "@/config/types";

export function isFeatureEnabled<K extends keyof FeaturesConfig>(
  features: FeaturesConfig,
  featureKey: K,
  subFeatureKey?: string
): boolean {
  const feature = features[featureKey];

  if (subFeatureKey && typeof feature === "object" && subFeatureKey in feature) {
    return (feature as Record<string, FeatureConfig>)[subFeatureKey].enabled;
  }

  return (feature as FeatureConfig).enabled;
}

export function getEnabledProfileFields(profileFields: ProfileFieldsConfig): Array<{
  key: keyof ProfileFieldsConfig;
  config: ProfileFieldConfig;
}> {
  return (Object.keys(profileFields) as Array<keyof ProfileFieldsConfig>)
    .filter((key) => profileFields[key].enabled)
    .map((key) => ({
      key,
      config: profileFields[key],
    }));
}
