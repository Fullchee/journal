import { View } from "react-native";

import { NavRow } from "@/components/nav-row";
import { NoteBody, QueryView } from "@/components/note-body";
import { Screen } from "@/components/screen";
import { useSaveHealthPlan, useHealthPlan } from "@/lib/data/notes";

/** Read in Storm: the plan comes first in large type, from the cache when offline. */
export default function HealthPlanScreen() {
  const save = useSaveHealthPlan();

  return (
    <Screen>
      <QueryView query={useHealthPlan()}>
        {({ item }) => <NoteBody body={item.body} save={save} size="large" />}
      </QueryView>
      <View>
        <NavRow
          href="/session-brief"
          label="Session brief"
          detail="What to bring to the next visit"
        />
        <NavRow
          href={{ pathname: "/habits", params: { kind: "bad" } }}
          label="Bad habits to bring"
        />
      </View>
    </Screen>
  );
}
