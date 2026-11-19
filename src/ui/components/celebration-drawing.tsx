import type { Celebration } from "@/core";

import { Leaf } from "./leaf";
import { Sprout } from "./sprout";
import { Tick } from "./tick";

interface CelebrationDrawingProps {
  celebration: Celebration;
  /** Called once the drawing has finished; keep it stable, or the drawing restarts. */
  onDone: () => void;
}

/** Draws one celebration: the mini tick, or the big sprout or leaf. */
export function CelebrationDrawing({ celebration, onDone }: CelebrationDrawingProps) {
  if (celebration.size === "mini") return <Tick onDone={onDone} />;

  return celebration.drawing === "sprout" ? <Sprout onDone={onDone} /> : <Leaf onDone={onDone} />;
}
