// PRODUCT-OWNED: how core screens look (D-054). Each slot replaces one display part of a core
// screen; core keeps the logic (consent checkboxes and button, validation, prices, access).
// Empty = the template's screens. Example:
//   export const slots: CoreSlots = {
//     signInHeader: ({ title, subtitle }) => <MyHero title={title} subtitle={subtitle} />,
//     quizStep: ChatBubbleStep,
//   };
import type { CoreSlots } from "../core/slots";

export const slots: CoreSlots = {};
