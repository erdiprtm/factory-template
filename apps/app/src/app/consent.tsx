import { Loading } from "@factory/ui";
import { Redirect, useRouter } from "expo-router";
import { acceptConsents } from "../core/api";
import { ConsentForm } from "../core/auth/consent-form";
import type { ConsentType } from "../core/auth/consent-rules";
import { useMe, useRefreshMe } from "../core/auth/use-me";
import { useI18n } from "../core/i18n";

export default function ConsentScreen() {
  const { t } = useI18n();
  const me = useMe();
  const refresh = useRefreshMe();
  const router = useRouter();

  if (me.isPending) return <Loading label={t("common.loading")} />;
  if (!me.data?.user) return <Redirect href="/sign-in" />;
  const needed = me.data.missingConsents as ConsentType[];
  if (needed.length === 0) return <Redirect href="/" />;

  return (
    <ConsentForm
      needed={needed}
      where="account"
      onAccept={async () => {
        // Only the missing ones: the API accepts them when they complete what's already recorded.
        await acceptConsents(needed);
        await refresh();
        router.replace("/");
      }}
    />
  );
}
