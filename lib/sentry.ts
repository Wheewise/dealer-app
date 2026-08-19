const SENTRY_DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function captureError(
  error: Error,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!SENTRY_DSN) return;

  const body = {
    exception: {
      values: [
        {
          type: error.name,
          value: error.message,
          stacktrace: error.stack
            ? { frames: error.stack.split("\n").map((line) => ({ filename: line })) }
            : undefined,
        },
      ],
    },
    ...(context ? { extra: context } : {}),
  };

  try {
    const dsn = new URL(SENTRY_DSN);
    const endpoint = `${dsn.origin}/api${dsn.pathname}/envelope/`;
    const auth = btoa(dsn.username + ":" + dsn.password);

    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.username}, sentry_secret=${dsn.password}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Don't let Sentry failures break the app
  }
}

export function sentryEnabled(): boolean {
  return Boolean(SENTRY_DSN);
}
