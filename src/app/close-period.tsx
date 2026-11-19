import {
  CloseKind,
  closingQuestion,
  currentPeriod,
  hasCloseContent,
  isClosePeriod,
  shiftClosePeriod,
  type CloseDraft,
  type CloseGoal,
  type CloseSave,
  type CloseSourcesBody,
} from "@/core";
import { Button, Text } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, TextInput, View } from "react-native";

import { ChoiceRow, type Choice } from "@/components/choice-row";
import {
  GoalReviewField,
  ProposedGoals,
  type GoalReview,
  type Proposal,
} from "@/components/close-goals";
import { CloseSources } from "@/components/close-sources";
import { NavRow } from "@/components/nav-row";
import { INPUT_CLASS } from "@/components/note-body";
import { Screen, Section } from "@/components/screen";
import { StatusText } from "@/components/status-text";
import { useDiscardGuard } from "@/hooks/use-discard-guard";
import { useKeyedDrafts } from "@/hooks/use-keyed-drafts";
import { ApiError } from "@/lib/api/errors";
import { confirm } from "@/lib/confirm";
import { useIsOnline } from "@/lib/data/data-provider";
import { closeQuery, useCloseDraft, useSaveClose } from "@/lib/data/period-close";
import { saveErrorMessage } from "@/lib/notes";

const CONFLICT = 409;

const RUNGS: Choice<CloseKind>[] = [
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

// A link may name the period, e.g. /close-period?kind=year&period=2026; otherwise it opens on the current quarter.
function askedPeriod(params: { kind?: string; period?: string }, now: Date) {
  const kind = CloseKind.safeParse(params.kind).data ?? "quarter";
  const { period = "" } = params;

  return { kind, period: isClosePeriod(kind, period) ? period : currentPeriod(kind, now) };
}

export default function ClosePeriod() {
  const params = useLocalSearchParams<{ kind?: string; period?: string }>();
  const [now] = useState(() => new Date());
  const [asked] = useState(() => askedPeriod(params, now));
  const [kind, setKind] = useState(asked.kind);
  const [period, setPeriod] = useState(asked.period);
  const current = currentPeriod(kind, now);
  const drafts = useKeyedDrafts<FormDraft>();
  const key = `${kind}/${period}`;

  useDiscardGuard(drafts.dirty, "The close you wrote is not saved.");

  function pickRung(rung: CloseKind) {
    setKind(rung);
    setPeriod(currentPeriod(rung, now));
  }

  return (
    <Screen>
      <ChoiceRow legend="Close a" choices={RUNGS} selected={kind} onPick={pickRung} />
      <View className="flex-row items-center justify-between gap-3">
        <Button
          variant="outline"
          className="h-11"
          onPress={() => setPeriod(shiftClosePeriod(kind, period, -1))}
        >
          <Text>Prev</Text>
        </Button>
        <Text className="font-sans-bold">{period}</Text>
        <Button
          variant="outline"
          className="h-11"
          disabled={period >= current}
          onPress={() => setPeriod(shiftClosePeriod(kind, period, 1))}
        >
          <Text>Next</Text>
        </Button>
      </View>
      <PeriodClose
        key={key}
        kind={kind}
        period={period}
        draft={drafts.get(key) ?? BLANK_FORM}
        onDraft={(change) => drafts.update(key, (draft = BLANK_FORM) => change(draft), isBlankForm)}
        onSaved={() => drafts.drop(key)}
      />
    </Screen>
  );
}

interface PeriodCloseProps extends DraftProps {
  kind: CloseKind;
  period: string;
  onSaved: () => void;
}

function PeriodClose({ kind, period, draft, onDraft, onSaved }: PeriodCloseProps) {
  const online = useIsOnline();
  const sources = useQuery(closeQuery(kind, period));
  const [savedId, setSavedId] = useState<number | null>(null);
  const [round, setRound] = useState(0);

  async function refetch() {
    const { data } = await sources.refetch();

    return data;
  }

  // A save moves Goals, so the next edit starts from a fresh form over the Goals still active.
  function editAgain() {
    setSavedId(null);
    setRound(round + 1);
  }

  if (savedId !== null) return <SavedClose period={period} id={savedId} onEdit={editAgain} />;

  if (sources.data !== undefined)
    return hasCloseContent(sources.data) ? (
      <CloseForm
        key={round}
        sources={sources.data}
        refetch={refetch}
        draft={draft}
        onDraft={onDraft}
        onSaved={({ id }) => {
          onSaved();
          setSavedId(id);
        }}
      />
    ) : (
      <Text variant="muted">
        Nothing written or logged in {period}, so there is nothing to close.
      </Text>
    );

  if (!online) return <Text variant="muted">Closing a period needs a connection.</Text>;

  if (sources.isError)
    return (
      <Text role="alert" className="text-destructive">
        Couldn&apos;t read the period. Try again.
      </Text>
    );

  return <Text variant="muted">Reading the period…</Text>;
}

function SavedClose({ period, id, onEdit }: { period: string; id: number; onEdit: () => void }) {
  return (
    <View className="gap-3">
      <StatusText>Saved</StatusText>
      <NavRow
        href={{ pathname: "/notes/[type]/[id]", params: { type: "reflections", id: String(id) } }}
        label={`Open the ${period} close`}
      />
      <Button variant="outline" className="h-11 self-start" onPress={onEdit}>
        <Text>Edit the close</Text>
      </Button>
    </View>
  );
}

const isConflict = (error: Error | null) => error instanceof ApiError && error.status === CONFLICT;

const askToReplace = (period: string) =>
  confirm({
    title: "Replace the close?",
    message: `${period} is closed already. Replace its reflection?`,
    action: "Replace",
  });

interface Review extends GoalReview {
  goal: CloseGoal;
}

/** What the owner has written for one period; Goal reviews are keyed by Goal id, so a refetch with new Goals keeps them. */
interface FormDraft {
  arc: string;
  answer: string;
  reviews: ReadonlyMap<number, GoalReview>;
  proposals: Proposal[];
}

interface DraftProps {
  draft: FormDraft;
  onDraft: (change: (draft: FormDraft) => FormDraft) => void;
}

const BLANK_REVIEW: GoalReview = { words: "", move: "carry", revision: "" };

const BLANK_FORM: FormDraft = { arc: "", answer: "", reviews: new Map(), proposals: [] };

const isBlankReview = ({ words, move, revision }: GoalReview) =>
  words === "" && move === BLANK_REVIEW.move && revision === "";

const isBlankForm = ({ arc, answer, reviews, proposals }: FormDraft) =>
  arc === "" &&
  answer === "" &&
  proposals.length === 0 &&
  [...reviews.values()].every((review) => isBlankReview(review));

// The AI draft replaces the arc, the Goal reviews and the proposals, but never the closing answer.
const hasDraftedWords = ({ arc, reviews, proposals }: FormDraft) =>
  arc.trim() !== "" ||
  [...reviews.values()].some(({ words, revision }) => `${words}${revision}`.trim() !== "") ||
  proposals.some(({ picked }) => picked);

const draftedReviews = ({ reviews }: CloseDraft) =>
  reviews.map(
    ({ goalId, review, move, revision }) => [goalId, { words: review, move, revision }] as const,
  );

const savedMove = ({ goal, words, move, revision }: Review) =>
  move === "revise" ? { goalId: goal.id, move, revision, words } : { goalId: goal.id, move, words };

const ready = (reviews: Review[], picked: Proposal[]) =>
  reviews.every(({ move, revision }) => move !== "revise" || revision.trim() !== "") &&
  picked.every((p) => p.title.trim() !== "");

const sameGoals = (reviews: Review[], goals: CloseGoal[]) =>
  reviews.length === goals.length &&
  goals.every((goal) => reviews.some((r) => r.goal.id === goal.id));

const GOALS_CHANGED =
  "The Goals changed while you wrote. The Goal review now lists the current Goals: check it, then save again.";

interface CloseFormProps extends DraftProps {
  sources: CloseSourcesBody;
  /** Reads the period again, for a close saved elsewhere since it opened. */
  refetch: () => Promise<CloseSourcesBody | undefined>;
  onSaved: (saved: { id: number }) => void;
}

/** Saves with `build(replace)`, asking before a replace, including one for a close saved elsewhere since this opened. */
function useCloseSaving(
  { sources, refetch, onSaved }: Omit<CloseFormProps, keyof DraftProps>,
  reviews: Review[],
) {
  const { kind, period, existing } = sources;
  const save = useSaveClose(kind, period);
  const [stale, setStale] = useState(false);

  // A 409 with no saved close is a Goal title clash, which stays on screen for the owner to fix.
  async function replaceNewer(build: (replace: boolean) => CloseSave) {
    const fresh = await refetch();

    if (!fresh?.existing) return;

    if (!sameGoals(reviews, fresh.goals)) {
      setStale(true);

      return;
    }

    if (!(await askToReplace(period))) return;

    save.reset();
    save.mutate(build(true), { onSuccess: onSaved });
  }

  async function onSave(build: (replace: boolean) => CloseSave) {
    setStale(false);

    if (existing !== null && !(await askToReplace(period))) return;

    save.mutate(build(existing !== null), {
      onSuccess: onSaved,
      onError: (error) =>
        existing === null && isConflict(error) ? void replaceNewer(build) : undefined,
    });
  }

  return { save, stale, onSave };
}

function SavedBanner({ period, id }: { period: string; id: number }) {
  return (
    <View className="gap-1">
      <Text variant="muted">{period} is closed already. Saving replaces it, after asking.</Text>
      <NavRow
        href={{ pathname: "/notes/[type]/[id]", params: { type: "reflections", id: String(id) } }}
        label="Open the saved close"
      />
    </View>
  );
}

interface ArcProps {
  kind: CloseKind;
  period: string;
  arc: string;
  /** Owner-written text the AI draft would replace, so it asks first. */
  hasWords: boolean;
  onArc: (arc: string) => void;
  onDraft: (draft: CloseDraft) => void;
}

const askToReplaceWords = () =>
  confirm({
    title: "Replace your text?",
    message: "Draft with AI replaces the arc, Goal reviews and picked Goals you have.",
    action: "Replace",
  });

/** The arc, with a Draft button that fills the whole form; a failed draft leaves it to write by hand. */
function ArcSection({ kind, period, arc, hasWords, onArc, onDraft }: ArcProps) {
  const online = useIsOnline();
  const draft = useCloseDraft(kind, period);

  async function draftWithAi() {
    if (hasWords && !(await askToReplaceWords())) return;

    draft.mutate(undefined, { onSuccess: onDraft });
  }

  return (
    <Section title={kind === "quarter" ? "The arc this quarter" : "The through-line this year"}>
      <Button
        variant="outline"
        disabled={!online || draft.isPending}
        onPress={() => void draftWithAi()}
      >
        <Text>{draft.isPending ? "Drafting…" : "Draft with AI"}</Text>
      </Button>
      {draft.isError && (
        <Text variant="muted">The AI draft failed; write the close yourself below.</Text>
      )}
      <TextInput
        aria-label="Arc"
        className={`${INPUT_CLASS} min-h-40`}
        multiline
        rows={Platform.OS === "web" ? 8 : undefined}
        textAlignVertical="top"
        value={arc}
        onChangeText={onArc}
      />
    </Section>
  );
}

interface SaveFooterProps {
  canSave: boolean;
  stale: boolean;
  error: Error | null;
  onSave: () => void;
}

function SaveFooter({ canSave, stale, error, onSave }: SaveFooterProps) {
  const online = useIsOnline();

  return (
    <>
      <Button disabled={!online || !canSave} onPress={onSave}>
        <Text>Save</Text>
      </Button>
      {!online && <Text variant="muted">Saving needs a connection.</Text>}
      {stale && (
        <StatusText tone="error" className="text-destructive">
          {GOALS_CHANGED}
        </StatusText>
      )}
      {error && (
        <StatusText tone="error" className="text-destructive">
          {saveErrorMessage(error)}
        </StatusText>
      )}
    </>
  );
}

function CloseForm({ draft, onDraft, ...props }: CloseFormProps) {
  const { kind, period, goals, existing } = props.sources;
  const { arc, answer, proposals } = draft;
  const reviews = goals.map((goal) => ({ goal, ...(draft.reviews.get(goal.id) ?? BLANK_REVIEW) }));
  const { save, stale, onSave } = useCloseSaving(props, reviews);
  const picked = proposals.filter((p) => p.picked);
  const edit = (patch: Partial<FormDraft>) => onDraft((current) => ({ ...current, ...patch }));

  const editReview = (goalId: number, review: GoalReview) =>
    onDraft((current) => ({ ...current, reviews: new Map(current.reviews).set(goalId, review) }));

  const fill = (drafted: CloseDraft) =>
    onDraft((current) => ({
      ...current,
      arc: drafted.arc,
      reviews: new Map([...current.reviews, ...draftedReviews(drafted)]),
      proposals: drafted.newGoals.map((goal) => ({ ...goal, picked: false })),
    }));

  const build = (replace: boolean): CloseSave => ({
    arc,
    answer,
    replace,
    newGoals: picked.map(({ title }) => ({ title })),
    moves: reviews.map((entry) => savedMove(entry)),
  });

  return (
    <View className="gap-6">
      {existing && <SavedBanner period={period} id={existing.id} />}
      <CloseSources sources={props.sources.sources} signals={props.sources.signals} />
      <ArcSection
        kind={kind}
        period={period}
        arc={arc}
        hasWords={hasDraftedWords(draft)}
        onArc={(next) => edit({ arc: next })}
        onDraft={fill}
      />
      <Section title={kind === "quarter" ? "Goal review" : "Goal movement this year"}>
        {reviews.length === 0 && <Text variant="muted">No active Goals.</Text>}
        {reviews.map((entry) => (
          <GoalReviewField
            key={entry.goal.id}
            goal={entry.goal}
            review={entry}
            onChange={({ words, move, revision }) =>
              editReview(entry.goal.id, { words, move, revision })
            }
          />
        ))}
      </Section>
      {kind === "year" && (
        <Section title="Next year's Goals">
          <ProposedGoals proposals={proposals} onChange={(next) => edit({ proposals: next })} />
        </Section>
      )}
      <Section title={closingQuestion(kind)}>
        <TextInput
          aria-label="Closing answer"
          className={`${INPUT_CLASS} min-h-24`}
          multiline
          rows={Platform.OS === "web" ? 4 : undefined}
          textAlignVertical="top"
          value={answer}
          onChangeText={(next) => edit({ answer: next })}
        />
        <SaveFooter
          canSave={!save.isPending && ready(reviews, picked)}
          stale={stale}
          error={save.error}
          onSave={() => void onSave(build)}
        />
      </Section>
    </View>
  );
}
