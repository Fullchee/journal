import { dayLabel, formatDay } from "@/core";
import { cn, Icon, Text } from "@/ui";
import { Ban, Circle, CircleCheck, ExternalLink } from "lucide-react-native";
import type { ReactNode } from "react";
import { Linking, Platform, Pressable, View } from "react-native";

import { NoteMarkdown } from "@/components/note-body";
import { Section } from "@/components/screen";
import type { WorkEntry } from "@/lib/data/work";
import { type EntryNode, percent, type ScoredPlan, type WorkWeekDay } from "@/lib/work-week";

type Status = "blocked" | "open" | "done" | "meeting" | "review" | null;

/** A blocker and an open task each read apart from done work; a note, or a task the note never closed, has no status. */
function statusOf({ kind, done }: WorkEntry): Status {
  if (kind === "blocker") return "blocked";

  if (done !== null) return done ? "done" : "open";

  return kind === "meeting" || kind === "review" ? kind : null;
}

// Leaf green means done; a blocker and an open task stay ink, never scarlet (DESIGN.md's Single Red Rule).
const STATUS = {
  blocked: { label: "Blocked", icon: Ban, className: "text-foreground" },
  open: { label: "To do", icon: Circle, className: "text-foreground" },
  done: { label: "Done", icon: CircleCheck, className: "text-primary" },
  meeting: { label: "Meeting", icon: null, className: "text-muted-foreground" },
  review: { label: "Review", icon: null, className: "text-muted-foreground" },
} as const;

function StatusLabel({ status }: { status: Status }) {
  if (status === null) return null;
  const { label, icon, className } = STATUS[status];

  return (
    <View className="flex-row items-center gap-1">
      {icon === null ? null : <Icon as={icon} size={14} className={className} />}
      <Text variant="label" className={className}>
        {label}
      </Text>
    </View>
  );
}

interface WorkRowProps {
  name: string;
  detail: string;
  url: string | undefined;
  children?: ReactNode;
}

/** A Ticket, PR or Code review row: its key over its title; the row opens it in the browser. */
function WorkRow({ name, detail, url, children }: WorkRowProps) {
  return (
    <Pressable
      role="link"
      aria-label={`${name}: ${detail}`}
      disabled={url === undefined}
      onPress={() => void Linking.openURL(String(url))}
      className={cn(
        "min-h-12 flex-row items-center gap-3 py-3 active:bg-accent",
        Platform.select({ web: "hover:bg-accent" }),
      )}
    >
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-baseline gap-x-2">
          <Text className="font-sans-medium">{name}</Text>
          {children}
        </View>
        <Text variant="muted">{detail}</Text>
      </View>
      {url === undefined ? null : <Icon as={ExternalLink} className="text-muted-foreground" />}
    </Pressable>
  );
}

/** One entry and the entries nested under it, each level indented. */
function Entry({ node }: { node: EntryNode }) {
  const status = <StatusLabel status={statusOf(node.entry)} />;

  return (
    <View className="border-border border-b">
      {node.name === null ? (
        <View className="gap-1 py-3">
          {status}
          <NoteMarkdown markdown={node.title} />
        </View>
      ) : (
        <WorkRow name={node.name} detail={node.title} url={node.url}>
          {status}
        </WorkRow>
      )}
      {node.children.length === 0 ? null : (
        <View className="pl-6">
          {node.children.map((child) => (
            <Entry key={child.entry.position} node={child} />
          ))}
        </View>
      )}
    </View>
  );
}

/** A Work day's entries, nested as the note nests them, then the Code reviews I gave. */
export function WorkDaySection({ day }: { day: WorkWeekDay }) {
  return (
    <Section title={day.heading}>
      <View>
        {day.entries.map((node) => (
          <Entry key={node.entry.position} node={node} />
        ))}
      </View>
      {day.reviews.length === 0 ? null : (
        <View className="gap-1 pt-2">
          <Text aria-level={3} variant="title">
            Code reviews
          </Text>
          {day.reviews.map((review) => (
            <View key={review.pr} className="border-border border-b">
              <WorkRow
                name={`${review.pr} · ${review.author}`}
                detail={review.title}
                url={review.url}
              />
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}

const weekday = (day: string) => formatDay(day, { weekday: "short" });

const dayOfMonth = (day: string) => formatDay(day, { day: "numeric" });

/** The Hit rate's target band, as a share of the column's height. */
const BAND = { low: 0.7, high: 0.85 };

function Band({ at }: { at: number }) {
  return (
    <View
      className="border-input absolute inset-x-0 border-t border-dashed"
      style={{ bottom: `${at * 100}%` }}
    />
  );
}

/** One scored Plan: a column filled to its Hit rate, the 70–85% band ruled across it. */
function HitRateColumn({ plan }: { plan: ScoredPlan }) {
  return (
    <View
      accessible
      aria-label={`${dayLabel(plan.day)}: ${percent(plan.hitRate)}`}
      className="flex-1 items-center gap-1"
    >
      <Text className="text-sm">{percent(plan.hitRate)}</Text>
      <View className="border-input h-16 w-full justify-end rounded-sm border">
        <View className="bg-primary w-full" style={{ height: `${plan.hitRate * 100}%` }} />
        <Band at={BAND.low} />
        <Band at={BAND.high} />
      </View>
      <Text variant="label" className="text-muted-foreground text-[0.85rem]">
        {weekday(plan.day)}
      </Text>
      <Text variant="muted">{dayOfMonth(plan.day)}</Text>
    </View>
  );
}

/** The latest scored Plans; a low Hit rate means sizing the next Plan smaller, never a red mark. */
export function HitRateTrend({ plans }: { plans: ScoredPlan[] }): ReactNode {
  return (
    <Section title="Hit rate">
      {plans.length === 0 ? (
        <Text variant="muted">No scored Plans yet.</Text>
      ) : (
        <>
          <Text variant="muted">Aim for 70–85%. Dashed lines mark the band.</Text>
          <View className="flex-row gap-2">
            {plans.map((plan) => (
              <HitRateColumn key={plan.day} plan={plan} />
            ))}
          </View>
        </>
      )}
    </Section>
  );
}
