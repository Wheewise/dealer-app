/**
 * Next.js calls this once per runtime at server startup.
 *
 * Used to wire optional Cloudflare KV bindings, and to surface security
 * controls that are configured off. A control that silently does nothing is
 * worse than one that is absent, because nothing looks broken.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    const { initCloudflareBindings } = await import("./lib/cloudflare-bindings");
    await initCloudflareBindings();

    const { assertTurnstileConfigured } = await import("./lib/turnstile");
    assertTurnstileConfigured();
  }
}
