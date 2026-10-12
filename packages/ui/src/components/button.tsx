import { Pressable, type PressableProps } from "react-native";
import { type ButtonSize, type ButtonVariant, buttonClasses, buttonTextClasses } from "../lib/classes";
import { cn } from "../lib/utils";
import { TextClassContext } from "./text";
import { useUiTokens } from "./theme";

// Reusables-style button, sized and rounded by the product's tokens (D-052). Note: never pass a
// function to `style` on Pressable — NativeWind 4.2.7 drops styles for function styles on React
// Native 0.86 (nativewind#1834). Use className.
export type ButtonProps = PressableProps & { variant?: ButtonVariant; size?: ButtonSize; className?: string };

export function Button({ className, variant, size, disabled, ...props }: ButtonProps) {
  const tokens = useUiTokens();
  return (
    <TextClassContext.Provider value={buttonTextClasses(tokens, variant ?? "default")}>
      <Pressable
        role="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        className={cn(
          buttonClasses(tokens, variant ?? "default", size ?? "default"),
          disabled && "opacity-50",
          className,
        )}
        {...props}
      />
    </TextClassContext.Provider>
  );
}
