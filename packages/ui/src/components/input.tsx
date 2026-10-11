import { TextInput, type TextInputProps } from "react-native";
import { cn } from "../lib/utils";

export function Input({ className, ...props }: TextInputProps & { className?: string }) {
  return (
    <TextInput
      className={cn(
        "h-12 w-full rounded-lg border border-input bg-background px-4 text-base text-foreground web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring",
        props.editable === false && "opacity-50",
        className,
      )}
      placeholderTextColor="hsl(215 16% 47%)"
      {...props}
    />
  );
}
