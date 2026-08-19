/**
 * Next.js calls this once per runtime at server startup.
 * Used here to wire Cloudflare KV bindings into rate-limit and OTP stores.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    const { initCloudflareBindings } = await import("./lib/cloudflare-bindings");
    await initCloudflareBindings();
  }
}
