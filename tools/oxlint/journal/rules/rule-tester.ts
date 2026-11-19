import { describe, it } from "node:test";
import { RuleTester } from "oxlint/plugins-dev";

// RuleTester expects hooks that return nothing; node:test tracks the promises its own hooks return.
RuleTester.describe = (text, method) => {
  void describe(text, method);
};

RuleTester.it = (text, method) => {
  void it(text, method);
};

export const ruleTester = new RuleTester({ languageOptions: { parserOptions: { lang: "tsx" } } });
