import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "src-tauri/target/**",
      ".work/**",
      "prototype/**",
      "tmp/**",
      "tools/**",
    ],
  },
  ...tseslint.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  {
    files: ["src/**/*.{ts,vue}", "vite.config.ts"],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".vue"],
      },
    },
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/max-attributes-per-line": "off",
      "vue/html-self-closing": "off",
      "vue/singleline-html-element-content-newline": "off",
      "@typescript-eslint/no-explicit-any": "off"
    },
  },
];
