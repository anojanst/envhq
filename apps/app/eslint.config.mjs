import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src/routeTree.gen.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // TanStack Router's file-based routing convention requires every route
    // file to define a local (unexported) component and reference it via
    // `Route`'s `component` option — react-refresh can't treat that as an
    // HMR boundary, but that's inherent to the convention, not a bug.
    files: ["src/routes/**/*.tsx", "src/main.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
