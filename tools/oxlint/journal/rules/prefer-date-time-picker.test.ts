import { preferDateTimePickerRule } from "./prefer-date-time-picker.ts";
import { ruleTester } from "./rule-tester.ts";

const inputs = [{ components: ["TextInput", "Input", "TextField"] }];

ruleTester.run("prefer-date-time-picker", preferDateTimePickerRule, {
  valid: [
    "<TextInput placeholder='Birthday' />",
    "<TextInput placeholder='Optional, like 9am' />",
    "<TextInput placeholder={hint} />",
    "<TextInput />",
    "<Input placeholder='YYYY-MM-DD' />",
    { code: "<Input placeholder='Search names, notes and dates' />", options: inputs },
    { code: "<Input aria-label=\"What's the date\" placeholder='Birthday' />", options: inputs },
    { code: "<Input aria-label='Ask about next time' />", options: inputs },
    { code: "<TextField label='Minutes a day' />", options: inputs },
  ],
  invalid: [
    { code: "<TextInput placeholder='YYYY-MM-DD' />", errors: [{ messageId: "typedDateOrTime" }] },
    {
      code: "<Input placeholder='HH:MM' />",
      options: inputs,
      errors: [{ messageId: "typedDateOrTime" }],
    },
    {
      code: "<TextField label='Started at' placeholder={'08:30'} />",
      options: inputs,
      errors: [{ messageId: "typedDateOrTime" }],
    },
    {
      code: "<Input placeholder='Starts at, e.g. 18:30' />",
      options: inputs,
      errors: [{ messageId: "typedDateOrTime" }],
    },
    {
      code: "<TextField label='Start date' />",
      options: inputs,
      errors: [{ messageId: "typedDateOrTime" }],
    },
    {
      code: "<Input aria-label='Time' />",
      options: inputs,
      errors: [{ messageId: "typedDateOrTime" }],
    },
    {
      code: "<TextInput accessibilityLabel={'When?'} />",
      errors: [{ messageId: "typedDateOrTime" }],
    },
  ],
});
