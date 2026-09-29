import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

export default [
  {
    // Build output and dependencies are not source. Without this, `eslint`
    // walked .next/ and .open-next/ and reported ~2,500 errors from
    // generated bundles — noise that hides real findings and makes the
    // CI lint step meaningless.
    ignores: [".next/**", ".open-next/**", "node_modules/**", "out/**", "public/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
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
