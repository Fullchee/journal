import type { TimeFieldProps } from "./time-field";

/** The browser's own time picker; its value is already HH:MM. */
export function TimeField({ label, value, onChange }: TimeFieldProps) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="border-input bg-background text-foreground h-11 rounded-md border px-3"
    />
  );
}
