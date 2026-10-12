/** Web prices and checkout links are for the web build only, never native (Section 6b, D-054). */
export const showsWebPrices = (os: string): boolean => os === "web";
