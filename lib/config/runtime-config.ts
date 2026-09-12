/**
 * Runtime configuration loader.
 *
 * **Module-load-time side effects**: `loadFromMountedConfig()` runs at import
 * time (see bottom of file). If the config files are missing or invalid the
 * module will throw immediately, preventing the server from starting. This is
 * intentional — a misconfigured server should fail fast.
 *
 * Zod schemas use `.strict()`, so any extra keys in the YAML files will cause
 * a validation error. When adding new config fields, update the schemas here
 * first, then deploy the new YAML.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { load as parseYaml } from "js-yaml";
import { z } from "zod";
import { logger } from "@/lib/logger";
import type {
  FeaturesConfig,
  ProfileFieldsConfig,
  PublicRuntimeConfig,
} from "@/config/types";

const featureConfigSchema = z
  .object({
    enabled: z.boolean(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const profileFieldSchema = z
  .object({
    enabled: z.boolean(),
    label: z.string().min(1),
    description: z.string().min(1),
    placeholder: z.string().min(1).optional(),
    inputType: z.enum(["text", "date", "url"]).optional(),
    required: z.boolean().optional(),
  })
  .strict();

const socialConnectorSchema = z
  .object({
    target: z.string().min(1),
    connectorId: z.string().min(1).optional(),
    enabled: z.boolean(),
    displayName: z.string().min(1).optional(),
    icon: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
  })
  .strict();

const socialIdentitiesFeatureConfigSchema = z
  .object({
    enabled: z.boolean(),
    config: z
      .object({
        connectors: z.array(socialConnectorSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .strict();

const featuresYamlSchema = z
  .object({
    features: z
      .object({
        emailChange: featureConfigSchema,
        phoneChange: featureConfigSchema,
        usernameChange: featureConfigSchema,
        mfa: z
          .object({
            totp: featureConfigSchema,
            backupCodes: featureConfigSchema,
            webAuthn: featureConfigSchema,
          })
          .strict(),
        passkey: featureConfigSchema,
        socialIdentities: socialIdentitiesFeatureConfigSchema,
        sessions: featureConfigSchema,
        accountDeletion: featureConfigSchema,
      })
      .strict(),
    profileFields: z
      .object({
        avatar: profileFieldSchema,
        name: profileFieldSchema,
        birthdate: profileFieldSchema,
        zoneinfo: profileFieldSchema,
        locale: profileFieldSchema,
        website: profileFieldSchema,
      })
      .strict(),
  })
  .strict();

interface RuntimeConfigData {
  features: FeaturesConfig;
  profileFields: ProfileFieldsConfig;
  configHash: string;
}

function resolveConfigDir(): string {
  const dir = process.env.CONFIG_DIR ?? "deploy";
  if (isAbsolute(dir)) {
    return dir;
  }

  return resolve(process.cwd(), dir);
}

function parseYamlFile(filePath: string): unknown {
  const raw = readFileSync(filePath, "utf8");
  return parseYaml(raw);
}

function sortedStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return "[" + value.map(sortedStringify).join(",") + "]";
  }

  const sorted = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => JSON.stringify(k) + ":" + sortedStringify((value as Record<string, unknown>)[k]));
  return "{" + sorted.join(",") + "}";
}

function createConfigHash(input: unknown): string {
  return createHash("sha256").update(sortedStringify(input)).digest("hex");
}

function loadFromMountedConfig(configDir: string): RuntimeConfigData | null {
  const featuresFile = resolve(configDir, "features.yaml");
  const featuresExampleFile = resolve(configDir, "features.yaml.example");

  const resolvedFeaturesFile = existsSync(featuresFile) ? featuresFile : featuresExampleFile;

  if (!existsSync(resolvedFeaturesFile)) {
    return null;
  }

  // 生产环境使用 .example 文件时发出警告
  const usingExampleFeatures = resolvedFeaturesFile === featuresExampleFile;

  if (process.env.NODE_ENV === "production" && usingExampleFeatures) {
    logger.warn(
      `[PRODUCTION WARNING] Using example config file: features.yaml.example. ` +
      `Copy it to features.yaml and customize for your environment.`
    );
  }

  const featuresRaw = parseYamlFile(resolvedFeaturesFile);

  const parsedFeatures = featuresYamlSchema.parse(featuresRaw);

  const configHash = createConfigHash(parsedFeatures);

  return {
    features: parsedFeatures.features,
    profileFields: parsedFeatures.profileFields,
    configHash,
  };
}

const configDir = resolveConfigDir();
const runtimeData = loadFromMountedConfig(configDir);

if (!runtimeData) {
  throw new Error(
    `Runtime config not found in '${configDir}'. Required file: features.yaml (or the .example variant)`
  );
}

export const features = runtimeData.features;
export const profileFields = runtimeData.profileFields;
export const configHash = runtimeData.configHash;

export function getPublicRuntimeConfig(): PublicRuntimeConfig {
  return {
    logtoEndpoint: process.env.LOGTO_ENDPOINT ?? null,
    features,
    profileFields,
    configHash,
  };
}

export function validateRuntimeConfig(): { configDir: string; configHash: string } {
  const mounted = loadFromMountedConfig(configDir);
  if (!mounted) {
    throw new Error(
      `Runtime config not found in '${configDir}'. Required file: features.yaml (or the .example variant)`
    );
  }

  return {
    configDir,
    configHash: mounted.configHash,
  };
}
