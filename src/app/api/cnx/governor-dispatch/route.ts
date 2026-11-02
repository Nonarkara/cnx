import { dispatchGovernor } from "../../../../lib/cnx/governor-dispatch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request): Promise<Response> {
  return dispatchGovernor(request, {
    config: {
      bridgeUrl: process.env.CNX_DISPATCH_BRIDGE_URL || "",
      bridgeKey: process.env.CNX_DISPATCH_BRIDGE_KEY || "",
    },
    allowAttempt: async () => {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const { env } = await getCloudflareContext({ async: true });
      const binding = (env as unknown as { CNX_RL_DISPATCH?: { limit: (options: { key: string }) => Promise<{ success: boolean }> } }).CNX_RL_DISPATCH;
      if (!binding) throw new Error("limiter unavailable");
      return (await binding.limit({ key: "cnx-governor-dispatch:all-attempts" })).success;
    },
    authorizePin: async pin => {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const { env } = await getCloudflareContext({ async: true });
      const gate = (env as unknown as { CNX_GOVERNOR_GATE?: { getByName: (name: string) => { authorize: (pin: string) => Promise<{ accepted: boolean; retryAfter?: number }> } } }).CNX_GOVERNOR_GATE;
      if (!gate) throw new Error("PIN gate unavailable");
      return gate.getByName("governor-pin-v1").authorize(pin);
    },
    fetch,
  });
}
