import { blankPart, type PartRef } from "@/core";
import { Button, Text, type NewPartSlot } from "@/ui";
import { useState } from "react";
import { Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { partSaveError, PartForm } from "@/components/part-form";
import { useCreatePart } from "@/lib/data/parts";

/** "New part…" on the Check-in: opens the Part form, and the saved Part is selected on the Check-in. */
export function NewPartButton({ onCreated }: { onCreated: (part: PartRef) => void }) {
  const [open, setOpen] = useState(false);
  const create = useCreatePart();
  const insets = useSafeAreaInsets();

  const close = () => {
    create.reset();
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" size="sm" className="self-start" onPress={() => setOpen(true)}>
        <Text>New part…</Text>
      </Button>
      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <ScrollView
          className="bg-background flex-1"
          contentContainerClassName="w-full max-w-2xl gap-4 self-center p-4"
          contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text aria-level={1} variant="title">
            New part
          </Text>
          <PartForm
            initial={blankPart()}
            disabled={create.isPending}
            error={partSaveError(create.error)}
            onCancel={close}
            onSave={(draft) =>
              create.mutate(draft, {
                onSuccess: (part) => {
                  onCreated({ id: part.id, name: part.name });
                  close();
                },
              })
            }
          />
        </ScrollView>
      </Modal>
    </>
  );
}

/** The Check-in's slot for "New part…"; pass it only online, since the form saves to the server. */
export const newPartButton: NewPartSlot = (select) => <NewPartButton onCreated={select} />;
