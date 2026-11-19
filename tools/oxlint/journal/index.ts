import { eslintCompatPlugin } from "@oxlint/plugins";

import { preferDateTimePickerRule } from "./rules/prefer-date-time-picker.ts";
import { requireMultilineRowsRule } from "./rules/require-multiline-rows.ts";

/** This repo's own Oxlint rules; vendored ones live in `../anti-slop`. */
export default eslintCompatPlugin({
  meta: { name: "journal" },
  rules: {
    "prefer-date-time-picker": preferDateTimePickerRule,
    "require-multiline-rows": requireMultilineRowsRule,
  },
});
