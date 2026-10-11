import product from "../../product.config";

// Plans come from product.config.ts, so these specs pass in every product repo (D-028).
type Plan = (typeof product.plans)[number];
// The schema requires at least one plan.
export const firstPlan = product.plans[0] as Plan;
export const lastPlan = (product.plans[product.plans.length - 1] ?? firstPlan) as Plan;
export const idr = (n: number) => `Rp${n.toLocaleString("id-ID")}`;
