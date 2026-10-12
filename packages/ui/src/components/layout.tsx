import { ActivityIndicator, ScrollView, View, type ViewProps } from "react-native";
import { badgeClasses, screenClasses } from "../lib/classes";
import { cn } from "../lib/utils";
import { Text } from "./text";
import { useUiTokens, useUiVariants } from "./theme";

/** Mobile-first page: scrolls, centered column capped for wide screens. */
export function Screen({ className, children, ...props }: ViewProps) {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="grow">
      <View className={cn(screenClasses(useUiTokens()), className)} {...props}>
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
  return <Text className={cn(badgeClasses(useUiTokens(), useUiVariants()), className)} {...props} />;
}

export function Separator({ className }: { className?: string }) {
  return <View className={cn("h-px w-full bg-border", className)} />;
}

export function ErrorText({ className, ...props }: React.ComponentProps<typeof Text>) {
  return <Text accessibilityLiveRegion="polite" className={cn("text-sm text-destructive", className)} {...props} />;
}
