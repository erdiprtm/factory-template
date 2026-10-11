import { cva, type VariantProps } from "class-variance-authority";
import { Pressable, type PressableProps } from "react-native";
import { cn } from "../lib/utils";
import { TextClassContext } from "./text";

// Reusables-style button. Note: never pass a function to `style` on Pressable — NativeWind 4.2.7
// drops styles for function styles on React Native 0.86 (nativewind#1834). Use className.
const buttonVariants = cva(
  "flex-row items-center justify-center gap-2 rounded-lg web:transition-colors web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-primary active:opacity-90 web:hover:opacity-90",
        secondary: "bg-secondary active:opacity-80",
        outline: "border border-input bg-background active:bg-accent web:hover:bg-accent",
        ghost: "active:bg-accent web:hover:bg-accent",
        destructive: "bg-destructive active:opacity-90",
        link: "",
      },
      size: {
        default: "h-12 px-5",
        sm: "h-10 px-4",
        lg: "h-14 px-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

const buttonTextVariants = cva("text-base font-semibold", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
      destructive: "text-destructive-foreground",
      link: "text-primary underline",
    },
  },
  defaultVariants: { variant: "default" },
});

export type ButtonProps = PressableProps & VariantProps<typeof buttonVariants> & { className?: string };

export function Button({ className, variant, size, disabled, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant })}>
      <Pressable
        role="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
        disabled={disabled}
        className={cn(buttonVariants({ variant, size }), disabled && "opacity-50", className)}
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { buttonVariants };
