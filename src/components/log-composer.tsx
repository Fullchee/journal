import { Button, cn, Icon, Text } from "@/ui";
import { Sparkles } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useCSSVariable } from "uniwind";

import { LogReceipt } from "@/components/log-receipt";
import { dismissModal } from "@/components/modal-header";
import { useLogDraft } from "@/hooks/use-log-draft";
import { useIsOnline } from "@/lib/data/data-provider";

export const OFFLINE_NOTICE =
  "Offline. Logging needs a connection; check Habits off on the Habits tab.";

type KeyPress = Parameters<NonNullable<TextInputProps["onKeyPress"]>>[0];

// The web keydown carries shiftKey and isComposing; an IME's Enter confirms a word instead of sending.
const isWebSendKey = ({ nativeEvent }: KeyPress) =>
  nativeEvent.key === "Enter" &&
  !("shiftKey" in nativeEvent && nativeEvent.shiftKey === true) &&
  !("isComposing" in nativeEvent && nativeEvent.isComposing === true);

function useKeyboardShown() {
  const [shown, setShown] = useState(() => Keyboard.isVisible());

  useEffect(() => {
    const listeners = [
      Keyboard.addListener("keyboardDidShow", () => setShown(true)),
      Keyboard.addListener("keyboardDidHide", () => setShown(false)),
    ];

    return () => {
      for (const listener of listeners) listener.remove();
    };
  }, []);

  return shown;
}

export interface LogComposerProps {
  autoFocus?: boolean;
  /** The log modal swaps itself for a form and closes on Done; Today pushes the form on top. */
  replace?: boolean;
}

/** Logs for existing Habits save at once and leave a Receipt above the box; anything else opens a form to check. */
export function LogComposer({ autoFocus, replace = false }: LogComposerProps) {
  const isOnline = useIsOnline();
  const { open, busy, unclear, receipt, dismissReceipt } = useLogDraft({ replace });
  const [text, setText] = useState("");
  const spinnerColor = useCSSVariable("--color-primary-foreground");
  const canSend = isOnline && !busy && text.trim() !== "";
  const [focused, setFocused] = useState(false);
  // The screen lifts everything above the keyboard, so the composer steps aside while another field is typed in.
  const keyboardServesOtherField = useKeyboardShown() && !focused;

  const submit = async () => {
    if (!canSend) return;

    if (await open(text.trim())) setText("");
  };

  return (
    <View
      testID="log-composer"
      className={cn(
        "gap-1 border-t border-border bg-background px-4 py-2",
        keyboardServesOtherField && "hidden",
      )}
    >
      {receipt && (
        <LogReceipt
          // A new Receipt gets a fresh Undo, not the last one's spent state.
          key={receipt.action}
          logged={receipt}
          undone="Removed these logs."
          onDone={() => {
            dismissReceipt();

            if (replace) dismissModal();
          }}
        />
      )}
      <View className="w-full flex-row items-end gap-2">
        <TextInput
          aria-label="Log something"
          placeholder="Log something…"
          value={text}
          onChangeText={setText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          multiline
          // A web textarea defaults to two rows; native grows from one line without it.
          rows={Platform.OS === "web" ? 1 : undefined}
          submitBehavior="submit"
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
          onKeyPress={(event) => {
            if (Platform.OS !== "web" || !isWebSendKey(event)) return;
            event.preventDefault();
            void submit();
          }}
          placeholderTextColorClassName="accent-muted-foreground/70"
          // field-sizing lets the web textarea grow when large text wraps the placeholder.
          className="border-input bg-card text-foreground placeholder:text-muted-foreground/70 max-h-32 min-h-12 flex-1 rounded-md border px-3 py-3 font-sans text-base web:field-sizing-content"
        />
        {/* Matches the input's one-line height so the button stays centred beside it. */}
        <Button
          size="icon"
          aria-label="Send"
          disabled={!canSend}
          onPress={() => void submit()}
          className="h-12 w-12 sm:h-12 sm:w-12"
        >
          {busy ? <ActivityIndicator size="small" color={spinnerColor} /> : <Icon as={Sparkles} />}
        </Button>
      </View>
      {unclear !== "" && (
        <Text aria-live="polite" className="text-destructive self-center text-sm">
          {unclear}
        </Text>
      )}
      {!isOnline && (
        <Text variant="muted" aria-live="polite" className="self-center">
          {OFFLINE_NOTICE}
        </Text>
      )}
    </View>
  );
}
