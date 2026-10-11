import { ActivityIndicator, ScrollView, View, type ViewProps } from "react-native";
import { cn } from "../lib/utils";
import { Text } from "./text";

/** Mobile-first page: scrolls, centered column capped for wide screens. */
export function Screen({ className, children, ...props }: ViewProps) {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="grow">
      <View className={cn("w-full max-w-lg flex-1 gap-5 self-center px-5 py-8", className)} {...props}>
        {children}
      </View>
    </ScrollView>
  );
}

export function CenteredScreen({ className, ...props }: ViewProps) {
  return <Screen className={cn("justify-center", className)} {...props} />;
}

export function Loading({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator accessibilityLabel={label} />
    </View>
  );
}

export function Badge({ className, ...props }: React.ComponentProps<typeof Text>) {
  return (
    <Text
      className={cn(
        "self-start rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function Separator({ className }: { className?: string }) {
  return <View className={cn("h-px w-full bg-border", className)} />;
}

export function ErrorText({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text accessibilityLiveRegion="polite" className={cn("text-sm text-destructive", className)} {...props} />;
}
