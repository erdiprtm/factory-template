import { Redirect, Stack } from "expo-router";
import { useMe } from "../../core/auth/use-me";
import { Loading } from "../../core/ui";

/** Protected area: signed-in users with all required consents. Paid features add requireAccess (Phase 4). */
export default function ProtectedLayout() {
  const me = useMe();
  if (me.isPending) return <Loading />;
  if (!me.data?.user) return <Redirect href="/sign-in" />;
  if (me.data.missingConsents.length > 0) return <Redirect href="/consent" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
