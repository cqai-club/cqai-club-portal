import { load as parseYaml } from "js-yaml";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

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

const featuresSchema = z
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
        socialIdentities: z
          .object({
            enabled: z.boolean(),
            config: z
              .object({
                connectors: z.array(socialConnectorSchema).optional(),
              })
              .passthrough()
              .optional(),
          })
          .strict(),
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

function resolveConfigDir() {
  const dir = process.env.CONFIG_DIR ?? "deploy";
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

function parseYamlFile(filePath) {
  return parseYaml(readFileSync(filePath, "utf8"));
}

const configDir = resolveConfigDir();
const featuresPath = resolve(configDir, "features.yaml");
const featuresExamplePath = resolve(configDir, "features.yaml.example");

const resolvedFeaturesPath = existsSync(featuresPath) ? featuresPath : featuresExamplePath;

if (!existsSync(resolvedFeaturesPath)) {
  throw new Error(
    `Runtime config missing in '${configDir}'. Required file: features.yaml (or the .example variant)`
  );
}

const parsedFeatures = featuresSchema.parse(parseYamlFile(resolvedFeaturesPath));

console.log(`[runtime-config] Validation successful. dir=${configDir}`);
console.log(`[runtime-config] features=${Object.keys(parsedFeatures.features).length}`);
console.log(`[runtime-config] profileFields=${Object.keys(parsedFeatures.profileFields).length}`);
