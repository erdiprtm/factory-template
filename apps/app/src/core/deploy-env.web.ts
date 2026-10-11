import { apiBaseUrl } from "./api-base";

export type DeployInfo = { env?: string; commit?: string };

let info: Promise<DeployInfo> | null = null;

/** Where this web build is running, from /api/health (one request, shared by analytics + monitoring). */
export function deployInfo(): Promise<DeployInfo> {
  info ??= fetch(`${apiBaseUrl()}/api/health`)
    .then((r) => r.json() as Promise<DeployInfo>)
    .catch(() => ({}));
  return info;
}
