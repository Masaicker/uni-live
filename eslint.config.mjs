import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const compat = new FlatCompat({ baseDirectory: path.dirname(fileURLToPath(import.meta.url)) });
const config = [
  { ignores: [".next/**", ".cache/**", "out/**", "build/**", "next-env.d.ts", "src/lib/danmaku/huya.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  { files: ["tests/**/*.cjs", "scripts/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
];
export default config;
