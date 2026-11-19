import type { Context, ESTree } from "@oxlint/plugins";
import * as z from "zod/mini";

/** The `components` option each text-input rule takes: the JSX names that render a text input. */
export const TEXT_INPUTS_SCHEMA = [
  {
    type: "object",
    properties: { components: { type: "array", items: { type: "string" } } },
    additionalProperties: false,
  },
];

const Components = z.optional(z.array(z.string()));
const TextInputsOption = z.optional(z.object({ components: Components }));

/** Names the element when it is one of the rule's text inputs. */
export const textInputNameOf = (context: Context) => {
  const components = new Set(
    TextInputsOption.parse(context.options[0])?.components ?? ["TextInput"],
  );

  return ({ name }: ESTree.JSXOpeningElement): string | undefined =>
    name.type === "JSXIdentifier" && components.has(name.name) ? name.name : undefined;
};
