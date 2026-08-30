import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "scripts/**"] },
  ...nextVitals,
  ...nextTs,
  {
    settings: { react: { version: "19.2.8" } },
  },
];

export default eslintConfig;
