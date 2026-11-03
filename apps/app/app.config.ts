import product from "../../product.config.ts";
import { expoConfig } from "./native-config.ts";

// App identity comes from product.config.ts (name, slug, scheme, and the `native` block, D-119),
// so a new product only edits that one file.
export default expoConfig(product);
