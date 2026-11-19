import type { LucideIcon, LucideProps } from "lucide-react-native";
import * as React from "react";
import { withUniwind } from "uniwind";

import { TextClassContext } from "./text";
import { cn } from "@/ui/lib/utils";

type IconProps = LucideProps & {
  as: LucideIcon;
} & React.RefAttributes<LucideIcon>;

function IconImpl({ as: IconComponent, ...props }: IconProps) {
  return <IconComponent {...props} />;
}

// Lucide icons take size and color props, not style, so Uniwind maps those from className.
const StyledIcon = withUniwind(IconImpl, {
  size: {
    fromClassName: "className",
    styleProperty: "width",
  },
  color: {
    fromClassName: "className",
    styleProperty: "color",
  },
});

function Icon({ as: IconComponent, className, ...props }: IconProps) {
  const textClass = React.use(TextClassContext);

  return (
    <StyledIcon
      as={IconComponent}
      className={cn("text-foreground size-5", textClass, className)}
      {...props}
    />
  );
}

export { Icon };
