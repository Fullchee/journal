import { clearTileSession } from "@/lib/widgets/tile-session.android";
import { clearTileSession as clearWebTileSession } from "@/lib/widgets/tile-session";

// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../../modules/journal-android";

beforeEach(() => jest.clearAllMocks());

it("ends the tile's session on Android", () => {
  clearTileSession(1000);

  expect(JournalAndroid.clearTileSession).toHaveBeenCalledWith(1000);
});

it("does nothing off Android", () => {
  clearWebTileSession(1000);

  expect(JournalAndroid.clearTileSession).not.toHaveBeenCalled();
});
