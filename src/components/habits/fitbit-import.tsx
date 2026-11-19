import {
  FITBIT_DEFAULT_THRESHOLDS,
  FITBIT_RULES,
  FITBIT_RULES_BY_RECORD,
  fitbitThreshold,
  type FitbitRule,
  type RecordStyle,
} from "@/core";
import { Button, Icon, Text } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react-native";
import { useState } from "react";
import { View, type TextInputProps } from "react-native";

import { TextField } from "@/components/habits/form-fields";
import { useLinkChange } from "@/hooks/use-link-change";
import { useIsOnline } from "@/lib/data/data-provider";
import type { LinkResult } from "@/lib/health/calm-auto-log";
import {
  fitbitAutoLog,
  type FitbitAutoLog,
  type FitbitLink,
  type FitbitLinks,
  type FitbitWriters,
} from "@/lib/health/fitbit-auto-log";
import { useFitbitWriters } from "@/lib/health/fitbit-writers";

const LINKS_KEY = ["fitbit-auto-log"] as const;
const FITBIT_UNREADABLE = "Couldn't read Fitbit data. Try again.";

interface RuleCopy {
  /** The Health Connect data the owner allows reading. */
  data: string;
  field: string;
  start: string;
  stop: string;
  linked: (threshold: number) => string;
}

const CHECK_COPY: Record<FitbitRule, RuleCopy> = {
  steps: {
    data: "Steps",
    field: "Steps a day",
    start: "Complete from Fitbit steps",
    stop: "Stop using Fitbit steps",
    linked: (n) => `Done on Days with ${String(n)} Fitbit steps or more.`,
  },
  sleep: {
    data: "Sleep",
    field: "Hours of sleep",
    start: "Complete from Fitbit sleep",
    stop: "Stop using Fitbit sleep",
    linked: (n) => `Done on Days after ${String(n)} hours of Fitbit sleep or more.`,
  },
  exercise: {
    data: "Exercise",
    field: "Exercise minutes a day",
    start: "Complete from Fitbit exercise",
    stop: "Stop using Fitbit exercise",
    linked: (n) => `Done on Days with ${String(n)} Fitbit exercise minutes or more.`,
  },
};

const MINUTES_COPY: RuleCopy = {
  ...CHECK_COPY.exercise,
  start: "Auto-log Fitbit exercise",
  stop: "Stop logging Fitbit exercise",
  linked: () => "Fitbit exercise sessions are logged here when the app opens.",
};

/** A Record style that takes at least one rule. */
type LinkStyle = Exclude<RecordStyle, "count">;

const plural = (n: number, one: string) => (n === 1 ? `1 ${one}` : `${String(n)} ${one}s`);

const ADDED = {
  check: (n: number) => `Marked ${plural(n, "Day")} done from Fitbit.`,
  duration: (n: number) => `Added ${plural(n, "session")} from Fitbit.`,
};

function linkedMessage(result: LinkResult, record: LinkStyle, copy: RuleCopy) {
  if (result.status === "linked") return ADDED[record](result.added);

  return result.status === "unavailable"
    ? "Health Connect isn’t on this phone. Install or update it, then try again."
    : `Allow Journal to read ${copy.data} in Health Connect, then try again.`;
}

interface RuleProps {
  rule: FitbitRule;
  copy: RuleCopy;
  autoLog: FitbitAutoLog;
  change: (action: () => Promise<string>) => Promise<void>;
  disabled: boolean;
}

// A Duration Habit takes every exercise minute, so only a check Habit has a threshold.
function ThresholdField({
  record,
  copy,
  ...props
}: Pick<TextInputProps, "value" | "onChangeText" | "onBlur"> & {
  record: LinkStyle;
  copy: RuleCopy;
}) {
  return (
    record === "check" && <TextField label={copy.field} keyboardType="decimal-pad" {...props} />
  );
}

/** A rule this Habit uses: a new threshold saves once the owner leaves the field. */
function StopButton({
  rule,
  copy,
  autoLog,
  change,
  disabled,
}: Pick<RuleProps, "rule" | "copy" | "autoLog" | "change" | "disabled">) {
  const unlink = () =>
    change(async () => {
      await autoLog.unlink(rule);

      return "Fitbit no longer completes this Habit.";
    });

  return (
    <Button variant="outline" disabled={disabled} onPress={() => void unlink()}>
      <Icon as={Activity} />
      <Text>{copy.stop}</Text>
    </Button>
  );
}

function LinkedRule({
  rule,
  link,
  record,
  copy,
  autoLog,
  change,
  reload,
  disabled,
}: RuleProps & { link: FitbitLink; record: LinkStyle; reload: () => Promise<void> }) {
  const [text, setText] = useState(String(link.threshold));

  async function saveThreshold() {
    const threshold = fitbitThreshold(text);

    if (threshold === null || threshold === link.threshold) return;
    await autoLog.setThreshold(rule, threshold);
    await reload();
  }

  return (
    <>
      <ThresholdField
        record={record}
        copy={copy}
        value={text}
        onChangeText={setText}
        onBlur={() => void saveThreshold()}
      />
      <Text>{copy.linked(link.threshold)}</Text>
      <StopButton rule={rule} copy={copy} autoLog={autoLog} change={change} disabled={disabled} />
    </>
  );
}

/** A rule this Habit doesn't use yet; linking needs every Habit's history, so it never answers a Day twice. */
function UnlinkedRule({
  rule,
  habit,
  record,
  copy,
  autoLog,
  change,
  disabled,
}: RuleProps & { habit: string; record: LinkStyle }) {
  const writers = useFitbitWriters();
  const [text, setText] = useState(String(FITBIT_DEFAULT_THRESHOLDS[rule]));
  const threshold = fitbitThreshold(text);
  const canLink = writers !== null && threshold !== null;

  const link = (ready: FitbitWriters, chosen: number) =>
    change(async () =>
      linkedMessage(await autoLog.link(rule, { habit, threshold: chosen }, ready), record, copy),
    );

  return (
    <>
      <ThresholdField record={record} copy={copy} value={text} onChangeText={setText} />
      <Button
        variant="outline"
        disabled={disabled || !canLink}
        onPress={canLink ? () => void link(writers, threshold) : undefined}
      >
        <Icon as={Activity} />
        <Text>{copy.start}</Text>
      </Button>
    </>
  );
}

function RuleLink({
  rule,
  habit,
  record,
  links,
  autoLog,
}: {
  rule: FitbitRule;
  habit: string;
  record: LinkStyle;
  links: FitbitLinks | undefined;
  autoLog: FitbitAutoLog;
}) {
  const isOnline = useIsOnline();
  const { message, busy, change, reload } = useLinkChange(LINKS_KEY, FITBIT_UNREADABLE);
  const linked = links?.[rule];
  const copy = record === "check" ? CHECK_COPY[rule] : MINUTES_COPY;

  const shared = {
    rule,
    copy,
    autoLog,
    change,
    disabled: !isOnline || busy || links === undefined,
  };

  return (
    <View className="gap-2">
      {linked?.habit === habit ? (
        <LinkedRule link={linked} record={record} reload={reload} {...shared} />
      ) : (
        <UnlinkedRule habit={habit} record={record} {...shared} />
      )}
      {message !== "" && <Text variant="muted">{message}</Text>}
    </View>
  );
}

/** A rule linked before the Habit's Record style changed: it no longer completes the Habit, but can still be unlinked. */
function UnfitRule({ rule, autoLog }: { rule: FitbitRule; autoLog: FitbitAutoLog }) {
  const isOnline = useIsOnline();
  const { message, busy, change } = useLinkChange(LINKS_KEY, FITBIT_UNREADABLE);
  const copy = CHECK_COPY[rule];

  return (
    <View className="gap-2">
      <Text>{`This Habit's Record style no longer takes Fitbit ${copy.data.toLowerCase()}.`}</Text>
      <StopButton
        rule={rule}
        copy={copy}
        autoLog={autoLog}
        change={change}
        disabled={!isOnline || busy}
      />
      {message !== "" && <Text variant="muted">{message}</Text>}
    </View>
  );
}

function FitbitSection({
  habit,
  record,
  autoLog,
}: {
  habit: string;
  record: RecordStyle;
  autoLog: FitbitAutoLog;
}) {
  const { data: links } = useQuery({ queryKey: LINKS_KEY, queryFn: autoLog.links });
  const fitting = FITBIT_RULES_BY_RECORD[record];

  const unfit = FITBIT_RULES.filter(
    (rule) => links?.[rule]?.habit === habit && !fitting.includes(rule),
  );

  if (record === "count" && unfit.length === 0) return null;

  return (
    <View className="border-border gap-4 border-t pt-4">
      <View className="gap-1">
        <Text aria-level={3} variant="title">
          Fitbit
        </Text>
        <Text variant="muted">Reads Fitbit data in Health Connect when the app opens.</Text>
      </View>
      {record !== "count" &&
        fitting.map((rule) => (
          <RuleLink
            key={rule}
            rule={rule}
            habit={habit}
            record={record}
            links={links}
            autoLog={autoLog}
          />
        ))}
      {unfit.map((rule) => (
        <UnfitRule key={rule} rule={rule} autoLog={autoLog} />
      ))}
    </View>
  );
}

/** Links this Habit to Fitbit's steps, sleep or exercise on this phone; one Habit per rule, so another link is replaced. A count Habit takes no rule. */
export function FitbitImport({ habit, record }: { habit: string; record: RecordStyle }) {
  if (fitbitAutoLog === null) return null;

  return <FitbitSection habit={habit} record={record} autoLog={fitbitAutoLog} />;
}
