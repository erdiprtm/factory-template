// PRODUCT-OWNED: the product's main screens as tabs (D-048), at most 4 (core adds Akun, and Admin for
// admins). Empty = core's default (Beranda, Akun). Core shows them as a bottom tab bar on phones and
// native, and as a top bar on wide web screens. Labels are keys in ./messages.ts (or core keys).
// Example:
//   export const productTabs: ProductTab<MessageKey>[] = [
//     { href: "/", label: "nav.home", icon: HomeIcon },
//     { href: "/nutrition", label: "fit.nav.nutrition", icon: PlateIcon },
//   ];
import type { MessageKey } from "../core/i18n";
import type { ProductTab } from "../core/nav/tabs";

export const productTabs: ProductTab<MessageKey>[] = [];
