import HealthPlanScreen from "@/app/(tabs)/(notes)/health-plan";
import { NotesList } from "@/components/notes-list";
import { DefaultDetail } from "@/components/two-pane";
import { useIsWide } from "@/hooks/use-is-wide";

/** Wide screens open on the Health plan, the note read in Storm, rather than an empty pane. */
export default function NotesScreen() {
  return useIsWide() ? (
    <DefaultDetail href="/health-plan">
      <HealthPlanScreen />
    </DefaultDetail>
  ) : (
    <NotesList />
  );
}
