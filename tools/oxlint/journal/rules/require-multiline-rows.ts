import { defineRule, type ESTree } from "@oxlint/plugins";

import { TEXT_INPUTS_SCHEMA, textInputNameOf } from "./text-inputs.ts";

const attributeName = (attribute: ESTree.JSXAttributeItem) =>
  attribute.type === "JSXAttribute" && attribute.name.type === "JSXIdentifier"
    ? attribute.name.name
    : undefined;

const isTurnedOff = (attribute: ESTree.JSXAttribute) =>
  attribute.value?.type === "JSXExpressionContainer" &&
  attribute.value.expression.type === "Literal" &&
  attribute.value.expression.value === false;

/** React Native Web renders a multiline TextInput as a `<textarea>` that starts two rows tall unless `rows` says otherwise. */
export const requireMultilineRowsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require `rows` on a multiline text input so its web height is a choice.",
    },
    messages: {
      missingRows:
        "Give this multiline `{{name}}` a `rows`: on web it renders a textarea that starts 2 rows tall. Android fixes the height to `rows`, so a bare `TextInput` passes it on web only.",
    },
    schema: TEXT_INPUTS_SCHEMA,
  },
  create(context) {
    const textInputName = textInputNameOf(context);

    return {
      JSXOpeningElement(node) {
        const name = textInputName(node);

        if (name === undefined) return;

        // A spread may carry `rows`, so the rule can't tell.
        const hasSpread = node.attributes.some(
          (attribute) => attribute.type === "JSXSpreadAttribute",
        );

        if (hasSpread) return;

        const multiline = node.attributes.find(
          (attribute) => attributeName(attribute) === "multiline",
        );

        const hasRows = node.attributes.some((attribute) => attributeName(attribute) === "rows");

        if (hasRows || multiline?.type !== "JSXAttribute" || isTurnedOff(multiline)) return;

        context.report({ node, messageId: "missingRows", data: { name } });
      },
    };
  },
});
