import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

// Minimal shared primitives until packages/ui arrives in Phase 5 (NativeWind + Reusables).

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  const ghost = props.variant === "ghost";
  return (
    <Pressable
      role="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.button, ghost ? styles.ghost : styles.primary, props.disabled && styles.disabled]}
    >
      <Text style={ghost ? styles.ghostText : styles.primaryText}>{props.label}</Text>
    </Pressable>
  );
}

export function Loading() {
  return (
    <Screen>
      <ActivityIndicator accessibilityLabel="loading" />
    </Screen>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  title: { fontSize: 28, fontWeight: "700", textAlign: "center" },
  body: { fontSize: 16, textAlign: "center", maxWidth: 420 },
  meta: { fontSize: 13, opacity: 0.7 },
  error: { fontSize: 14, color: "#b91c1c", textAlign: "center" },
  input: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: { width: "100%", maxWidth: 420, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  primary: { backgroundColor: "#2563eb" },
  ghost: { borderWidth: 1, borderColor: "#cbd5e1" },
  disabled: { opacity: 0.5 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  ghostText: { fontSize: 16, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, width: "100%", maxWidth: 420 },
});
