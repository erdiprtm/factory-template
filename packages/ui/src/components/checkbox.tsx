import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { cn } from "../lib/utils";
import { Text } from "./text";

// Inline check glyph: importing lucide-react-native pulled the whole icon set into the web
// bundle (Metro doesn't tree-shake by default), so the one icon we need is drawn here.
function CheckIcon() {
  return (
    <Svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

/** Accessible checkbox with its label as part of the press target. */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <Pressable
      role="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      aria-checked={checked}
      onPress={() => onCheckedChange(!checked)}
      className={cn("min-h-12 w-full flex-row items-center gap-3", className)}
    >
      <View
        className={cn(
          "h-6 w-6 items-center justify-center rounded-md border-2",
          checked ? "border-primary bg-primary" : "border-input bg-background",
        )}
      >
        {checked ? <CheckIcon /> : null}
      </View>
      <Text className="flex-1">{label}</Text>
    </Pressable>
  );
}
