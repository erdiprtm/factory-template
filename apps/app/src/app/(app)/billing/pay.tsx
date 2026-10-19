import { lazyScreen } from "../../../core/lazy-screen";

// Core screen (Pakasir's own checkout, D-092), loaded on demand with the other signed-in core
// screens (one chunk, D-059).
export default lazyScreen(() => import("../../../core/signed-in").then((m) => m.BillingPay));
