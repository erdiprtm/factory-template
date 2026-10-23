// PRODUCT-OWNED: how core screens look (D-054). Each slot replaces one display part of a core
// screen; core keeps the logic (consent checkboxes and button, validation, prices, access).
// Empty = the template's screens. Example:
//   export const slots: CoreSlots = {
//     signInHeader: ({ title, subtitle }) => <MyHero title={title} subtitle={subtitle} />,
//     quizStep: ChatBubbleStep,
//     // Not on the first screen: load on demand, out of the first web bundle (D-101).
//     planCard: lazySlot(() => import("./my/plan-card").then((m) => m.PlanCard)),
//   };
import type { CoreSlots } from "../core/slots";

export const slots: CoreSlots = {};
