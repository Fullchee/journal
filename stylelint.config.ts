/** @type {import('stylelint').Config} */
export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: [
    "**/dist/**",
    "**/web-build/**",
    "android/**",
    "modules/*/android/build/**",
    // Vendored Expo skills; upstream owns their code.
    ".agents/**",
    ".claude/**",
  ],
  // Lets no-unknown-custom-properties see the palette from any CSS file.
  referenceFiles: ["src/ui/tokens.css"],
  reportDescriptionlessDisables: true,
  reportInvalidScopeDisables: true,
  reportNeedlessDisables: true,
  reportUnscopedDisables: true,
  rules: {
    "at-rule-no-unknown": [
      true,
      {
        // Tailwind 4 directives; Uniwind reads the same ones.
        ignoreAtRules: [
          "apply",
          "config",
          "custom-variant",
          "plugin",
          "reference",
          "source",
          "theme",
          "utility",
          "variant",
        ],
      },
    ],
    "function-no-unknown": [
      true,
      {
        // Uniwind's native functions plus Tailwind 4's build-time helpers.
        ignoreFunctions: [
          "hairlineWidth",
          "fontScale",
          "pixelRatio",
          "--alpha",
          "--spacing",
          "theme",
        ],
      },
    ],
    // Uniwind resolves these functions on the device, so CSS grammar can't type-check them.
    "declaration-property-value-no-unknown": [
      true,
      { ignoreProperties: { "/.+/": [/\b(?:hairlineWidth|fontScale|pixelRatio)\(/] } },
    ],
    "function-name-case": [
      "lower",
      { ignoreFunctions: ["hairlineWidth", "fontScale", "pixelRatio"] },
    ],
    // Tailwind 4 resolves bare package imports such as @import 'tailwindcss'.
    "import-notation": "string",
    // Font stacks hold family names, whose case is part of the name.
    "value-keyword-case": ["lower", { ignoreProperties: [/^--font-/] }],
    "color-named": "never",
    "declaration-no-important": true,
    "font-weight-notation": "numeric",
    "max-nesting-depth": [2, { ignoreAtRules: ["layer", "variant", "media", "supports"] }],
    "no-unknown-custom-properties": true,
    "selector-max-compound-selectors": 3,
    "selector-max-id": 0,
    "selector-max-universal": 1,
    "selector-no-qualifying-type": true,
    "selector-max-specificity": "0,3,0",
  },
};
