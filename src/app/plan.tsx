import {
  busySpans,
  calendarMessage,
  initialChoices,
  planPools,
  sizeTasks,
  survivors,
  targetDay,
  triageBody,
  type Choices,
  type PlanTask,
} from "@/core";
import { Button, Text, cn } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";

import { NoteMarkdown } from "@/components/note-body";
import { BlocksView, ProposedDay } from "@/components/plan-day/blocks-view";
import { TriageList } from "@/components/plan-day/triage-list";
import { Screen, Section } from "@/components/screen";
import { useIsOnline } from "@/lib/data/data-provider";
import {
  busyQuery,
  planTasksQuery,
  useTriage,
  useWriteBlocks,
  type BlocksResult,
  type BusyBody,
  type PlanBody,
} from "@/lib/data/plan";

const OFFLINE = "Planning needs a connection.";

type Step = "reach" | "triage" | "blocks" | "done";

type StepName = Exclude<Step, "done">;

const STEP_NAMES: Record<StepName, string> = {
  reach: "Reach for",
  triage: "Triage",
  blocks: "Blocks",
};

export default function Planner() {
  const online = useIsOnline();
  // Fixed for the visit, so crossing 17:00 mid-plan doesn't switch the day being planned.
  const [day] = useState(() => targetDay(new Date()));
  const tasks = useQuery(planTasksQuery(day));

  if (tasks.data?.tasks.length === 0 && tasks.data.workPlan.length === 0)
    return <NothingToPlan body={tasks.data} day={day} />;

  if (tasks.data) return <PlanFlow body={tasks.data} day={day} online={online} />;

  return (
    <Screen>
      <Text variant="muted">Planning {day}.</Text>
      <TasksStatus online={online} isError={tasks.isError} onRetry={() => void tasks.refetch()} />
    </Screen>
  );
}

function TasksStatus({
  online,
  isError,
  onRetry,
}: {
  online: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (!online) return <Text>{OFFLINE}</Text>;

  if (!isError) return <LoadingRows label="Reading your tasks…" />;

  return (
    <View className="gap-2">
      <Text role="alert" className="text-destructive">
        Couldn&apos;t load your tasks.
      </Text>
      <Button variant="outline" className="h-11 self-start" onPress={onRetry}>
        <Text>Try again</Text>
      </Button>
    </View>
  );
}

const PLACEHOLDER_ROWS = ["first", "second", "third"];

/** Blank rows where the tasks or calendar will land; static, so Reduce Motion has nothing to stop. */
function LoadingRows({ label }: { label: string }) {
  return (
    <View accessible role="progressbar" aria-label={label} aria-busy className="gap-2">
      <Text variant="muted">{label}</Text>
      {PLACEHOLDER_ROWS.map((row) => (
        <View key={row} className="bg-muted h-11 rounded-sm" />
      ))}
    </View>
  );
}

type Calendar = BusyBody | Exclude<BlocksResult, { status: "ok" }>;

/** The busy times and placed blocks, or nothing until the calendar reads ok. */
function proposeDay(
  calendar: Calendar | undefined,
  kept: PlanTask[],
  minutes: Record<string, string>,
  day: string,
) {
  if (calendar?.status !== "ok") return { busy: [], pools: [] };

  const busy = busySpans(calendar.busy, day);
  // A blank or invalid estimate becomes NaN, which sizeTasks turns into the default.
  const estimates = Object.fromEntries(Object.entries(minutes).map(([id, v]) => [id, Number(v)]));

  return { busy, pools: planPools(sizeTasks(kept, estimates), busy, day) };
}

const initialMinutes = (body: PlanBody) =>
  Object.fromEntries(
    [...body.tasks, ...body.workPlan].map((t) => [
      t.id,
      String(body.proposals?.[t.id]?.minutes ?? 30),
    ]),
  );

function NothingToPlan({ body, day }: { body: PlanBody; day: string }) {
  return (
    <Screen>
      <Text variant="muted">Planning {day}.</Text>
      <ReachFor body={body} />
      <Text>Nothing overdue, today or tomorrow.</Text>
    </Screen>
  );
}

function PlanFlow({ body, day, online }: { body: PlanBody; day: string; online: boolean }) {
  // The Work Plan was triaged at the day's close, so Triage shows only for Todoist tasks.
  const fromTriage: [StepName, ...StepName[]] =
    body.tasks.length > 0 ? ["triage", "blocks"] : ["blocks"];

  const steps: [StepName, ...StepName[]] =
    body.reminders === "" ? fromTriage : ["reach", ...fromTriage];

  const [step, setStep] = useState<Step>(steps[0]);

  const [choices, setChoices] = useState<Choices>(() => initialChoices(body.tasks, body.proposals));

  const [minutes, setMinutes] = useState<Record<string, string>>(() => initialMinutes(body));

  const triage = useTriage();
  const blocks = useWriteBlocks();
  const busy = useQuery({ ...busyQuery(day), enabled: step === "blocks" });

  // A failed write that names a calendar problem replaces the busy times, as journal does.
  const calendar = blocks.data && blocks.data.status !== "ok" ? blocks.data : busy.data;
  const kept = [...survivors(body.tasks, choices), ...body.workPlan];
  const proposal = proposeDay(calendar, kept, minutes, day);

  function confirmTriage() {
    const changes = triageBody(choices, day);

    if (changes.postpone.length + changes.drop.length === 0) setStep("blocks");
    else triage.mutate(changes, { onSuccess: () => setStep("blocks") });
  }

  function checkCalendarAgain() {
    blocks.reset();
    void busy.refetch();
  }

  function confirmBlocks() {
    blocks.mutate(
      { day, pools: proposal.pools },
      { onSuccess: (r) => r.status === "ok" && setStep("done") },
    );
  }

  const content = {
    reach: <ReachFor body={body} />,
    triage: (
      <TriageList
        tasks={body.tasks}
        proposals={body.proposals}
        choices={choices}
        onChoose={(id, choice) => setChoices((c) => ({ ...c, [id]: choice }))}
      />
    ),
    blocks: (
      <BlocksStep
        kept={kept}
        minutes={minutes}
        onMinutes={(id, value) => setMinutes((m) => ({ ...m, [id]: value }))}
        calendar={
          <CalendarPanel
            calendar={calendar}
            busyFailed={busy.isError}
            proposal={proposal}
            onRetry={checkCalendarAgain}
          />
        }
      />
    ),
    done: <Text>Done. The blocks are on your calendar and the tasks have their times.</Text>,
  }[step];

  return (
    <View className="bg-background flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="w-full max-w-4xl gap-6 self-center p-4"
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="muted">Planning {day}.</Text>
        {step !== "done" && <StepIndicator steps={steps} current={step} />}
        {!online && <Text className="text-destructive">{OFFLINE}</Text>}
        {content}
      </ScrollView>
      <StepFooter
        step={step}
        online={online}
        triage={triage}
        blocks={blocks}
        canWriteBlocks={kept.length > 0 && calendar?.status === "ok"}
        nothingPlaced={proposal.pools.every((p) => p.placed.length === 0)}
        onNext={() => setStep(fromTriage[0])}
        onConfirmTriage={confirmTriage}
        onConfirmBlocks={confirmBlocks}
      />
    </View>
  );
}

interface BlocksStepProps {
  kept: PlanTask[];
  minutes: Record<string, string>;
  onMinutes: (id: string, value: string) => void;
  calendar: ReactNode;
}

function BlocksStep({ kept, ...props }: BlocksStepProps) {
  return kept.length === 0 ? (
    <Text>No tasks kept, so nothing to block.</Text>
  ) : (
    <BlocksView tasks={kept} {...props} />
  );
}

interface CalendarPanelProps {
  calendar: Calendar | undefined;
  busyFailed: boolean;
  proposal: ReturnType<typeof proposeDay>;
  onRetry: () => void;
}

function CalendarPanel({ calendar, busyFailed, proposal, onRetry }: CalendarPanelProps) {
  return calendar?.status === "ok" ? (
    <ProposedDay pools={proposal.pools} busy={proposal.busy} />
  ) : (
    <CalendarProblem failure={calendar} busyFailed={busyFailed} onRetry={onRetry} />
  );
}

interface StepFooterProps {
  step: Step;
  online: boolean;
  triage: Pick<ReturnType<typeof useTriage>, "isError" | "isPending">;
  blocks: Pick<ReturnType<typeof useWriteBlocks>, "isError" | "isPending">;
  canWriteBlocks: boolean;
  nothingPlaced: boolean;
  onNext: () => void;
  onConfirmTriage: () => void;
  onConfirmBlocks: () => void;
}

function StepFooter({ step, ...props }: StepFooterProps) {
  const content = {
    reach: (
      <Button className="h-11" onPress={props.onNext}>
        <Text>Next</Text>
      </Button>
    ),
    triage: (
      <>
        {props.triage.isError && (
          <Text role="alert" className="text-destructive">
            Couldn&apos;t update Todoist. Nothing is half-confirmed; try again.
          </Text>
        )}
        <Button
          className="h-11"
          disabled={!props.online || props.triage.isPending}
          onPress={props.onConfirmTriage}
        >
          <Text>{props.triage.isPending ? "Saving to Todoist…" : "Confirm triage"}</Text>
        </Button>
      </>
    ),
    blocks: props.canWriteBlocks ? (
      <>
        {props.blocks.isError && (
          <Text role="alert" className="text-destructive">
            Couldn&apos;t write the blocks to Google Calendar and Todoist. Your estimates are kept;
            try again.
          </Text>
        )}
        <Button
          className="h-11"
          disabled={!props.online || props.blocks.isPending || props.nothingPlaced}
          onPress={props.onConfirmBlocks}
        >
          <Text>
            {props.blocks.isPending
              ? "Writing to Google Calendar and Todoist…"
              : "Confirm and write to calendar"}
          </Text>
        </Button>
      </>
    ) : null,
    done: null,
  }[step];

  return content === null ? null : (
    <View className="border-border bg-background gap-2 border-t p-4">{content}</View>
  );
}

function ReachFor({ body }: { body: PlanBody }) {
  if (body.reminders === "") return null;

  return (
    <Section title={`${body.zone}: reach for`}>
      <NoteMarkdown markdown={body.reminders} testID="reach-for" />
    </Section>
  );
}

interface CalendarProblemProps {
  failure: Exclude<Calendar, { status: "ok" }> | undefined;
  busyFailed: boolean;
  onRetry: () => void;
}

function CalendarProblem({ failure, busyFailed, onRetry }: CalendarProblemProps) {
  if (!failure && !busyFailed) return <LoadingRows label="Reading your calendar…" />;

  return (
    <View className="gap-2">
      <Text role="alert" className="text-destructive">
        {failure ? calendarMessage(failure.status) : "Couldn't reach the app. Try again."}
      </Text>
      <Button variant="outline" className="h-11 self-start" onPress={onRetry}>
        <Text>Check calendar again</Text>
      </Button>
    </View>
  );
}

function StepIndicator({ steps, current }: { steps: StepName[]; current: Step }) {
  return (
    <View className="flex-row flex-wrap gap-2" aria-label="Steps">
      {steps.map((name, i) => (
        <StepPill key={name} active={name === current}>
          {`${i + 1}. ${STEP_NAMES[name]}`}
        </StepPill>
      ))}
    </View>
  );
}

function StepPill({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <View
      aria-current={active ? "step" : undefined}
      className={cn(
        "rounded-full border px-3 py-1",
        active ? "border-primary bg-primary" : "border-border",
      )}
    >
      <Text className={cn("text-sm", active ? "text-primary-foreground" : "text-muted-foreground")}>
        {children}
      </Text>
    </View>
  );
}
