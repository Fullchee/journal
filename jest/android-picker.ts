import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";

/**
 * Android's date and clock dialogs answer at once: the date dialog with `date`, the clock with `time`.
 * With neither, a dialog opens and picks nothing. Returns the `open` spy, to read what each dialog opened on.
 */
export function pickOnAndroid(date?: Date, time = date) {
  return jest.spyOn(DateTimePickerAndroid, "open").mockImplementation(({ mode, onValueChange }) => {
    const picked = mode === "time" ? time : date;

    if (picked !== undefined)
      onValueChange?.({ nativeEvent: { timestamp: picked.getTime(), utcOffset: 0 } }, picked);
  });
}
