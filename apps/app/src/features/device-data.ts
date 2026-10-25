// PRODUCT-OWNED: the product's own device storage, cleared when the user deletes their account
// (D-105, UU PDP). Core already clears every core/kv key (web: localStorage and sessionStorage),
// the product's own keys included, keeping only the theme and language choice. Clear anything else
// the product stores on the device here: IndexedDB, the Cache API, files. Errors are ignored.
export async function onDeviceWipe(): Promise<void> {}
