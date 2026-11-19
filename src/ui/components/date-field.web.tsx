import type { DateFieldProps } from "./date-field";

/** The browser's own date picker; its value is already YYYY-MM-DD. */
export function DateField({ label, value, min, max, onChange }: DateFieldProps) {
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      onChange={(event) => onChange(event.target.value)}
      className="border-input bg-background text-foreground h-11 rounded-md border px-3"
    />
  );
}
