import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, pixelSignup } from "../api";

export const meQueryKey = ["me"] as const;

/** The signed-in user, their access, and consents still needed. Single source for route guards. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async () => {
      const res = await api.api.me.$get();
      if (!res.ok) throw new Error(`me ${res.status}`);
      const me = await res.json();
      // Signed up just now with consent given before signup (D-043, D-122): the server recorded it.
      if (me.user) pixelSignup(me.signupEventId);
      return me;
    },
  });
}

export function useRefreshMe() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: meQueryKey });
}
