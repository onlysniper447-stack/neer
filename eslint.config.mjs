// Shared lint config for the TypeScript packages. apps/web has its own (Next.js) config.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.next/**", "apps/web/**", "**/*.config.*"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^(eth_sign|personal_sign|eth_signTypedData(_v[34])?|eth_sendTransaction|wallet_sendCalls)$/]",
          message: "Neer never asks a wallet to sign or send. Remove this signing method.",
        },
      ],
    },
  },
);
