import { cn } from "@/ui";

it("keeps a theme type size beside a text color", () => {
  expect(cn("text-foreground text-label", "text-primary-foreground")).toBe(
    "text-label text-primary-foreground",
  );
});

it("lets a later theme size or radius replace an earlier one", () => {
  expect(cn("text-base", "text-display")).toBe("text-display");
  expect(cn("rounded-md", "rounded-button")).toBe("rounded-button");
});
