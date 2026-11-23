import {
  defineScreenTimeTask,
  useScreenTimeSync,
  useUsageAccess,
} from "@/lib/screen-time/screen-time";

test("off Android, there is no job, nothing to send and no Usage access to ask for", () => {
  defineScreenTimeTask();
  useScreenTimeSync();

  expect(useUsageAccess()).toBeNull();
});
