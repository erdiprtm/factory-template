import { defineProduct } from "@factory/config";
import { describe, expect, it } from "vitest";
import product from "../../../product.config";
import { appScheme, expoConfig } from "../native-config";

// D-119: the Expo app config comes from product.config.ts `native`, for whichever product this is.
describe("expoConfig", () => {
  it("without native ids (no store build yet): no android/ios blocks, the scheme as before", () => {
    const c = expoConfig({ ...product, native: { ...product.native, androidPackage: null, iosBundleId: null } });
    expect(c.scheme).toBe(appScheme(product.slug));
    expect(c.android).toBeUndefined();
    expect(c.ios).toBeUndefined();
    expect(c.runtimeVersion).toEqual({ policy: "fingerprint" });
    expect(c.plugins).toEqual([["expo-router", { asyncRoutes: false }]]);
  });

  it("with native ids: store ids, permission texts only when set, the EAS project", () => {
    const native = {
      ...product.native,
      androidPackage: "id.example.app",
      iosBundleId: "id.example.app",
      easProjectId: "6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      permissions: { camera: "Kamera dipakai untuk memotret makananmu.", photos: null },
    };
    const c = expoConfig({ ...product, native });
    expect(c.android?.package).toBe("id.example.app");
    expect(c.ios?.bundleIdentifier).toBe("id.example.app");
    expect(c.ios?.infoPlist).toEqual({ NSCameraUsageDescription: "Kamera dipakai untuk memotret makananmu." });
    expect(c.extra).toEqual({ eas: { projectId: "6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" } });
  });

  it("the schema: defaults off, store ids must be reverse-domain", () => {
    expect(product.native.version).toMatch(/^\d+\.\d+\.\d+$/);
    const base = { ...product, ai: null } as unknown as Parameters<typeof defineProduct>[0];
    expect(() => defineProduct({ ...base, native: { androidPackage: "MynaFit" } })).toThrow(/reverse-domain/);
    expect(defineProduct({ ...base, native: { androidPackage: "id.mynahealth.fit" } }).native).toMatchObject({
      androidPackage: "id.mynahealth.fit",
      iosBundleId: null,
      permissions: { camera: null, photos: null },
    });
  });
});
