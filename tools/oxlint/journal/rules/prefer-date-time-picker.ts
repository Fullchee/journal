import { defineRule, type ESTree } from "@oxlint/plugins";

import { TEXT_INPUTS_SCHEMA, textInputNameOf } from "./text-inputs.ts";

// A placeholder spelling out a date or clock format ("YYYY-MM-DD", "HH:MM", "18:30") marks a typed date or time.
const DATE_OR_TIME_FORMAT = /\b(?:YYYY|MM-DD|DD\/MM|MM\/DD|HH:MM|\d{1,2}:\d{2})\b/i;

// So does a label naming one ("Start date", "Time", "When?", "Started at"); "Ask about next time" is free text.
const DATE_OR_TIME_LABEL = /^(?:(?:start|end|due)\s+)?(?:date|time|day)$/i;
const WHEN_LABEL = /^(?:when\??|start(?:s|ed)? at)$/i;

const isDateOrTimeLabel = (text: string) => DATE_OR_TIME_LABEL.test(text) || WHEN_LABEL.test(text);

// Which attributes can mark a typed date or time, and how each one's text does.
const MATCHERS = new Map([
  ["placeholder", (text: string) => DATE_OR_TIME_FORMAT.test(text)],
  ["label", isDateOrTimeLabel],
  ["aria-label", isDateOrTimeLabel],
  ["accessibilityLabel", isDateOrTimeLabel],
]);

/** The attribute's text when it is written out (`"…"` or `{"…"}`), else "". */
const literalText = ({ value }: ESTree.JSXAttribute) => {
  const literal = value?.type === "JSXExpressionContainer" ? value.expression : value;

  return literal?.type === "Literal" ? String(literal.value) : "";
};

const asksForDateOrTime = (item: ESTree.JSXAttributeItem) =>
  item.type === "JSXAttribute" &&
  item.name.type === "JSXIdentifier" &&
  (MATCHERS.get(item.name.name)?.(literalText(item)) ?? false);

/** A typed date or time is a text box on Android; `DateField` and `TimeField` open the system's own dialogs. */
export const preferDateTimePickerRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Pick dates and times with Android's dialogs instead of typing them into a text input.",
    },
    messages: {
      typedDateOrTime:
        "`{{name}}` asks for a typed date or time. Use `DateField` or `TimeField` from `@/ui`: they open Android's date and clock dialogs, and a browser date or time input on web.",
    },
    schema: TEXT_INPUTS_SCHEMA,
  },
  create(context) {
    const textInputName = textInputNameOf(context);

    return {
      JSXOpeningElement(node) {
        const name = textInputName(node);

        if (name === undefined || node.attributes.every((item) => !asksForDateOrTime(item))) return;

        context.report({ node, messageId: "typedDateOrTime", data: { name } });
      },
    };
  },
});
