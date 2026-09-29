import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "scripts/dist/**",
      "site/collect/assets/markdown-it.min.js",
      "site/collect/assets/easymde.min.js",
      "scripts/ci-smoke-test.js",
      "scripts/deployment-safety-test.js",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
