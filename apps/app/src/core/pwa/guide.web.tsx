import { Button, cn, Text } from "@factory/ui";
import { type ReactNode, useState } from "react";
import { Pressable, View } from "react-native";
import product from "../../../../../product.config";
import { type MessageKey, useI18n } from "../i18n";
import { GUIDE_BROWSERS, type GuideBrowser, guideBrowser } from "./rules";

// "Pasang di HP" guide (D-126), web only (install-card.web.tsx). One collapsible row per browser,
// each with a small drawn mark and its name; the visitor's own browser opens by default. Each step
// shows the thing to tap as a drawn glyph (plain DOM <svg>, no react-native-svg on web, D-059).
// The marks are simple drawings that name the browser (nominative use), not official artwork.

const withName = (s: string) => s.replaceAll("{name}", product.name);

/** A 24-unit stroke glyph, in the surrounding text colour. */
function Glyph({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** iOS Share: a tray with an arrow up. */
const ShareGlyph = () => (
  <Glyph>
    <path d="M12 3v12" />
    <path d="m8 7 4-4 4 4" />
    <path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" />
  </Glyph>
);

/** "Tambah ke Layar Utama": a rounded square with a plus. */
const AddGlyph = () => (
  <Glyph>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </Glyph>
);

/** Chrome's menu on Android: three dots, vertical. */
const MenuGlyph = () => (
  <Glyph>
    <circle cx="12" cy="5" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="19" r="1.3" fill="currentColor" />
  </Glyph>
);

/** Install on Android: a phone with an arrow down. */
const InstallGlyph = () => (
  <Glyph>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M12 7v7m-3-3 3 3 3-3" />
  </Glyph>
);

/** A simple compass: Safari's mark, drawn. */
function SafariMark() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#1E88E5" />
      <circle cx="12" cy="12" r="9" fill="none" stroke="#fff" strokeWidth="0.8" opacity="0.7" />
      <path d="M16.5 7.5 13 13l-2-2z" fill="#EF4444" />
      <path d="M7.5 16.5 11 11l2 2z" fill="#fff" />
    </svg>
  );
}

/** Three sectors round a blue dot: Chrome's mark, drawn. */
function ChromeMark() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12 2.47 6.5A11 11 0 0 1 21.53 6.5z" fill="#EA4335" />
      <path d="M12 12 21.53 6.5A11 11 0 0 1 12 23z" fill="#FBBC04" />
      <path d="M12 12 12 23A11 11 0 0 1 2.47 6.5z" fill="#34A853" />
      <circle cx="12" cy="12" r="5.4" fill="#fff" />
      <circle cx="12" cy="12" r="4.2" fill="#4285F4" />
    </svg>
  );
}

/** What a step shows to tap: a drawn glyph, or the button's own word ("Tambah", "Instal"). */
type Step = { text: MessageKey; glyph?: () => ReactNode; button?: MessageKey };

const ADD_TO_HOME: Step = { text: "pwa.guide.addToHome", glyph: AddGlyph };
const STEPS: Record<GuideBrowser, Step[]> = {
  safari: [
    { text: "pwa.guide.safari.share", glyph: ShareGlyph },
    ADD_TO_HOME,
    { text: "pwa.guide.add", button: "pwa.guide.addButton" },
  ],
  "chrome-ios": [
    { text: "pwa.guide.chromeIos.share", glyph: ShareGlyph },
    ADD_TO_HOME,
    { text: "pwa.guide.add", button: "pwa.guide.addButton" },
  ],
  "chrome-android": [
    { text: "pwa.guide.android.menu", glyph: MenuGlyph },
    { text: "pwa.guide.android.install", glyph: InstallGlyph },
    { text: "pwa.guide.android.confirm", button: "pwa.guide.installButton" },
  ],
};

const NAME: Record<GuideBrowser, MessageKey> = {
  safari: "pwa.guide.safari",
  "chrome-ios": "pwa.guide.chromeIos",
  "chrome-android": "pwa.guide.android",
};

function StepRow({ step }: { step: Step }) {
  const { t } = useI18n();
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-9 w-16 items-center justify-center rounded-lg border border-border bg-muted text-primary">
        {step.button ? <Text className="text-xs font-semibold text-primary">{t(step.button)}</Text> : step.glyph?.()}
      </View>
      <Text className="flex-1">{withName(t(step.text))}</Text>
    </View>
  );
}

function Row({
  browser,
  open,
  onToggle,
  onInstall,
}: {
  browser: GuideBrowser;
  open: boolean;
  onToggle: () => void;
  onInstall?: () => void;
}) {
  const { t } = useI18n();
  const ios = browser !== "chrome-android";
  return (
    <View className="rounded-xl border border-border" testID={`pwa-guide-${browser}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        aria-expanded={open}
        onPress={onToggle}
        className="min-h-11 flex-row items-center gap-3 px-3 py-2"
      >
        {browser === "safari" ? <SafariMark /> : <ChromeMark />}
        <Text className="flex-1 font-semibold">{t(NAME[browser])}</Text>
        <View className={cn("text-muted-foreground", open && "rotate-180")}>
          <Glyph size={16}>
            <path d="m6 9 6 6 6-6" />
          </Glyph>
        </View>
      </Pressable>
      {open ? (
        <View className="gap-3 px-3 pb-3" testID={`pwa-guide-${browser}-steps`}>
          {browser === "chrome-android" && onInstall ? (
            <Button className="min-h-11" onPress={onInstall}>
              <Text>{t("pwa.install")}</Text>
            </Button>
          ) : (
            STEPS[browser].map((step) => <StepRow key={step.text} step={step} />)
          )}
          {ios ? <Text variant="muted">{t("pwa.guide.signIn")}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The guide: Safari, Chrome (iPhone/iPad), Chrome (Android). The visitor's browser (guideBrowser)
 * opens first; tapping a row opens or closes it. `onInstall` is set where Chrome's own install
 * dialog is available: the Android row then shows "Pasang" instead of the menu steps.
 */
export function InstallGuide({ onInstall }: { onInstall?: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<GuideBrowser | null>(() =>
    typeof navigator === "undefined" ? null : guideBrowser(navigator.userAgent, navigator.maxTouchPoints),
  );
  return (
    <View className="gap-2" testID="pwa-guide">
      <Text className="font-semibold">{t("pwa.guide.title")}</Text>
      {GUIDE_BROWSERS.map((b) => (
        <Row
          key={b}
          browser={b}
          open={open === b}
          onToggle={() => setOpen(open === b ? null : b)}
          onInstall={onInstall}
        />
      ))}
    </View>
  );
}
