import { View, type ViewProps } from "react-native";
import { cn } from "../lib/utils";
import { Text } from "./text";

export function Card({ className, ...props }: ViewProps) {
  return <View className={cn("w-full gap-4 rounded-lg border border-border bg-card p-5", className)} {...props} />;
}

export function CardHeader({ className, ...props }: ViewProps) {
  return <View className={cn("gap-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text variant="h3" className={cn("text-card-foreground", className)} {...props} />;
}

export function CardDescription(props: React.ComponentProps<typeof Text>) {
  return <Text variant="muted" {...props} />;
}

export function CardContent({ className, ...props }: ViewProps) {
  return <View className={cn("gap-3", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps) {
  return <View className={cn("flex-row items-center gap-3", className)} {...props} />;
}
