import { lazyScreen } from "../core/lazy-screen";

// Core screen, loaded on demand with the other signed-in core screens (one chunk, D-059).
export default lazyScreen(() => import("../core/signed-in").then((m) => m.SignIn));
