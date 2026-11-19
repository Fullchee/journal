import { screen } from "expo-router/testing-library";
import { userEvent } from "@testing-library/react-native";

/** Expands the Habit editor's More section, which opens collapsed; its header may add a count ("More · 3 filled"). */
export const openMore = async () =>
  userEvent.press(await screen.findByRole("button", { name: /^More(?: · \d+ filled)?$/ }));
