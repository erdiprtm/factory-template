import type { UploadLimits } from "../core/uploads";

// PRODUCT-OWNED: API routes that take a larger body than the default 64 KB, by exact path, in bytes
// (capped at 5 MB). Example: a meal photo, resized on the device to 1024 px JPEG (~150-300 KB):
//   export const uploadLimits: UploadLimits = { "/api/scan": 2 * 1024 * 1024 };
// Read the file in the route with readImageUpload(c) from ../core/uploads.
export const uploadLimits: UploadLimits = {};
