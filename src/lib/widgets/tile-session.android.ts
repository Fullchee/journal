// eslint-disable-next-line no-restricted-imports -- Expo local modules live outside src, where no @/ alias reaches
import JournalAndroid from "../../../modules/journal-android";

/** The tile keeps a stopped session until its minutes save, so a failed save can be retried from the tile. */
export function clearTileSession(startedAtMs: number) {
  JournalAndroid.clearTileSession(startedAtMs);
}
