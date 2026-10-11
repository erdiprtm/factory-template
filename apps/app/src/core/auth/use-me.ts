import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export const meQueryKey = ["me"] as const;

/** The signed-in user, their access, and consents still needed. Single source for route guards. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      const res = await api.api.me.$get();
      if (!res.ok) throw new Error(`me ${res.status}`);
      return res.json();
    },
  });
}

export function useRefreshMe() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: meQueryKey });
}
