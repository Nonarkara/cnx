import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    // Build output and dependencies are not source. Without this, `eslint`
    // walked .next/ and .open-next/ and reported ~2,500 errors from
    // generated bundles — noise that hides real findings and makes the
    // CI lint step meaningless.
    ignores: [".next/**", ".open-next/**", "node_modules/**", "out/**", "public/**", "next-env.d.ts", ".claude/**"],
  },
  // Preserve the existing Hooks checks during the framework migration.
  // React Compiler diagnostics need a separate rollout across the map renderers.
  ...nextVitals.map(entry => !entry.rules ? entry : {
    ...entry,
    rules: Object.fromEntries(Object.entries(entry.rules).filter(([rule]) =>
      !rule.startsWith("react-hooks/") || ["react-hooks/rules-of-hooks", "react-hooks/exhaustive-deps"].includes(rule),
    )),
  }),
  ...nextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "react/no-unescaped-entities": "off",
      // deck.gl + maplibre-gl ambient typings live in src/types/ambient.d.ts.
      // The map file uses any at the edges because the upstream libraries
      // don't ship their own .d.ts; the runtime is well-typed via the
      // builder's context.
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
];

export default config;
