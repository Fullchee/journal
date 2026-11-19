import { clockLabel, formatMinutes, minutesOf, torontoTime } from "@/core";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Button } from "./button";
import { Text } from "./text";

export interface TimeFieldProps {
  label: string;
  /** HH:MM on a 24-hour clock, or "" before a time is picked. */
  value: string;
  onChange: (value: string) => void;
}

// The dialog shows a Date's local fields, so a Toronto HH:MM maps to them and back; with no time yet it opens on Toronto's now.
const toDate = (time: string) => {
  const date = new Date();

  date.setHours(0, minutesOf(time === "" ? torontoTime(date) : time), 0, 0);

  return date;
};

const toTime = (date: Date) => formatMinutes(date.getHours() * 60 + date.getMinutes());

/** Android's clock dialog; the web twin (time-field.web.tsx) is a native time input. */
export function TimeField({ label, value, onChange }: TimeFieldProps) {
  const shown = value === "" ? null : clockLabel(value);

  const open = () =>
    DateTimePickerAndroid.open({
      value: toDate(value),
      mode: "time",
      onValueChange: (_event, date) => onChange(toTime(date)),
    });

  return (
    <Button
      variant="outline"
      className="h-11"
      aria-label={`${label}: ${shown ?? "not picked"}`}
      onPress={open}
    >
      <Text>{shown ?? "Pick a time"}</Text>
    </Button>
  );
}
