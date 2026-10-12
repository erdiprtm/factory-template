import { TextInput, type TextInputProps } from "react-native";
import { inputClasses } from "../lib/classes";
import { cn } from "../lib/utils";
import { useUiTokens, useUiVariants } from "./theme";

export function Input({ className, ...props }: TextInputProps & { className?: string }) {
  return (
    <TextInput
      className={cn(inputClasses(useUiTokens(), useUiVariants()), props.editable === false && "opacity-50", className)}
      placeholderTextColor="hsl(215 16% 47%)"
      {...props}
    />
  );
}
