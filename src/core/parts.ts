import * as z from "zod/mini";

import { CheckIn, type PartRef } from "./check-in-view";

/**
 * IFS's three roles, `protector` for a Part that guards before its kind is clear,
 * and `unknown` for one named before its page is filled in (matches the parts CHECK).
 */
export const PART_ROLES = ["manager", "firefighter", "exile", "protector", "unknown"] as const;

export const PartRole = z.enum(PART_ROLES);

export type PartRole = z.infer<typeof PartRole>;

export const ROLE_LABELS: Record<PartRole, string> = {
  manager: "Manager",
  firefighter: "Firefighter",
  exile: "Exile",
  protector: "Protector",
  unknown: "Not yet known",
};

/**
 * A Part as the API returns it, with the IFS worksheet's questions:
 * what it wants for me, what it fears would happen if it stopped, and where I feel it in my body.
 * `description` is Markdown: how it shows up.
 */
export const Part = z.object({
  id: z.number(),
  name: z.string(),
  role: PartRole,
  wants: z.string(),
  fears: z.string(),
  feltIn: z.string(),
  description: z.string(),
  retired: z.boolean(),
  createdAt: z.string(),
});

export type Part = z.infer<typeof Part>;

/** A row of the Parts list: `recentCheckIns` counts the Check-ins naming it in the last 30 days. */
const PartListRow = z.extend(Part, { recentCheckIns: z.number() });

export type PartListRow = z.infer<typeof PartListRow>;

export const PartsBody = z.object({ parts: z.array(PartListRow) });

type PartsBody = z.infer<typeof PartsBody>;

/** One Part's page: the Part and its recent Check-ins, in control or present; `used` says any Check-in names it. */
export const PartBody = z.object({
  part: Part,
  checkIns: z.array(CheckIn),
  used: z.boolean(),
});

export type PartBody = z.infer<typeof PartBody>;

/** What the Part form edits and saves whole. */
export type PartDraft = Pick<Part, "name" | "role" | "wants" | "fears" | "feltIn" | "description">;

export const blankPart = (name = ""): PartDraft => ({
  name,
  role: "unknown",
  wants: "",
  fears: "",
  feltIn: "",
  description: "",
});

/** The Check-in's part chips: the active Parts, oldest first; until they load, none. */
export const partOptions = (parts: Part[] | undefined): PartRef[] =>
  parts?.filter((part) => !part.retired).map(({ id, name }) => ({ id, name })) ?? [];

interface PartGroup<Row extends Part> {
  heading: string;
  parts: Row[];
}

/** The Parts list's sections: one per role in IFS order, then the retired Parts; empty sections drop out. */
export function partGroups<Row extends Part>(parts: Row[]): PartGroup<Row>[] {
  const active = parts.filter((part) => !part.retired);

  return [
    ...PART_ROLES.map((role) => ({
      heading: ROLE_LABELS[role],
      parts: active.filter((part) => part.role === role),
    })),
    { heading: "Retired", parts: parts.filter((part) => part.retired) },
  ].filter((group) => group.parts.length > 0);
}
