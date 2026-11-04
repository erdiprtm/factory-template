import { lazyScreen } from "../../core/lazy-screen";

// Core screen (D-120): the web→app hand-off link, https://<domain.app>/app/masuk?c=<code>.
export default lazyScreen(() => import("../../core/signed-in").then((m) => m.AppHandoffLanding));
