import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Which feature code each route group may import (docs/02-stack/repo-structure.md).
const guestForbidden = [
  "@/features/waiter/*",
  "@/features/kitchen/*",
  "@/features/menu-import/*",
  "@/features/staff/*",
  "@/features/dashboard/*",
  "@/features/platform/*",
  "@/lib/offline/*",
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "design/**",
    "docs/**",
    "playwright-report/**",
    "test-results/**",
    ".superpowers/**",
    ".claude/**",
  ]),
  {
    // UI text comes from messages/{hy,ru,en}.json only.
    files: ["src/app/**/*.tsx", "src/features/**/*.tsx", "src/components/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        { noStrings: true, ignoreProps: true, allowedStrings: ["·", "—", "–", "֏", "×", "+", "−", "/", ":", "%", "#", "↑", "↓", "●"] },
      ],
    },
  },
  {
    files: ["src/app/\\[locale\\]/**/*.{ts,tsx}", "src/features/ordering/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: guestForbidden, message: "Guest pages must not import staff, admin or AI code." }] },
      ],
    },
  },
  {
    files: ["src/app/(staff)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/menu-import/*", "@/features/dashboard/*", "@/features/platform/*"],
              message: "Staff screens must not import admin or platform code.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/(admin)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/features/platform/*"], message: "Admin must not import platform code." }] },
      ],
    },
  },
]);
