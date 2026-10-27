import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "node_modules/**", "test-results/**", "playwright-report/**", "next-env.d.ts"] },
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/^(eth_sign|personal_sign|eth_signTypedData(_v[34])?|eth_sendTransaction|wallet_sendCalls)$/]",
          message: "Neer never asks a wallet to sign or send. Remove this signing method.",
        },
      ],
    },
  },
];

export default config;
