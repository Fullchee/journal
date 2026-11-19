import { torontoDay } from "@/core";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Button } from "./button";
import { Text } from "./text";

export interface DateFieldProps {
  label: string;
  /** YYYY-MM-DD, or "" before a day is picked. */
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}

// The dialog shows a Date's local fields, so a Day maps to local midnight and back.
const toDate = (day: string) => new Date(`${day}T00:00`);

const toDay = (date: Date) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");

/** Android's date dialog; the web twin (date-field.web.tsx) is a native date input. */
export function DateField({ label, value, min, max, onChange }: DateFieldProps) {
  const picked = value !== "";

  const open = () => {
    // With no day yet, the dialog opens on the earliest day allowed, else today.
    const start = picked ? value : (min ?? torontoDay(new Date()));

    DateTimePickerAndroid.open({
      value: toDate(start),
      mode: "date",
      ...(min !== undefined && { minimumDate: toDate(min) }),
      ...(max !== undefined && { maximumDate: toDate(max) }),
      onValueChange: (_event, date) => onChange(toDay(date)),
    });
  };

  return (
    <Button
      variant="outline"
      className="h-11"
      aria-label={`${label}: ${picked ? value : "not picked"}`}
      onPress={open}
    >
      <Text>{picked ? value : "Pick a day"}</Text>
    </Button>
  );
}
