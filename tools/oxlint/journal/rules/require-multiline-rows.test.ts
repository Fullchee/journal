import { requireMultilineRowsRule } from "./require-multiline-rows.ts";
import { ruleTester } from "./rule-tester.ts";

ruleTester.run("require-multiline-rows", requireMultilineRowsRule, {
  valid: [
    "<TextInput multiline rows={Platform.OS === 'web' ? 1 : undefined} />",
    "<TextInput />",
    "<TextInput multiline={false} />",
    "<TextInput multiline {...props} />",
    "<Input multiline />",
    { code: "<Input multiline rows={3} />", options: [{ components: ["TextInput", "Input"] }] },
  ],
  invalid: [
    { code: "<TextInput multiline />", errors: [{ messageId: "missingRows" }] },
    {
      code: "<TextInput multiline={true} numberOfLines={2} />",
      errors: [{ messageId: "missingRows" }],
    },
    {
      code: "<TextField label='Why' multiline />",
      options: [{ components: ["TextInput", "TextField"] }],
      errors: [{ messageId: "missingRows" }],
    },
  ],
});
