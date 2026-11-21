import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge can't see tokens.css: without these, it reads text-label as a color and drops it.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "label", "zone", "day-header"],
      radius: ["button"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
