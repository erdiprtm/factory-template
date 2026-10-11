// Native: deploy info isn't needed until Phase 10 (analytics and monitoring are no-ops there).
export type DeployInfo = { env?: string; commit?: string };
export function deployInfo(): Promise<DeployInfo> {
  return Promise.resolve({});
}
