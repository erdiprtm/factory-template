import { Check } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { cn } from "../lib/utils";
import { Text } from "./text";

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
        {checked ? <Check size={16} strokeWidth={3} color="white" /> : null}
      </View>
      <Text className="flex-1">{label}</Text>
    </Pressable>
  );
}
