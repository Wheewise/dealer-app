#!/usr/bin/env node
/**
 * Generates the three deployable role apps from this monorepo.
 *
 * Each output is a complete, independently buildable Next.js project:
 *   repos/user-app    → wheewise.com
 *   repos/dealer-app  → dealer.wheewise.com
 *   repos/admin-app   → admin.wheewise.com
 *
 * The shared foundation (lib/, components/, supabase/, configs, tests) is copied
 * byte-identically into all three, so the only intentional difference between
 * the repos is the contents of `app/`. Keeping the shared half identical is
 * what makes the duplication maintainable: regenerate rather than hand-edit,
 * and a diff of two repos' lib/ directories should always be empty.
 *
 * Usage:  node scripts/build-role-repos.mjs [--out ../repos]
 */

import { cp, mkdir, rm, writeFile, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "..");

const outFlag = process.argv.indexOf("--out");
const OUT_ROOT = path.resolve(
  SRC,
  outFlag !== -1 ? process.argv[outFlag + 1] : "../repos",
);

/** Files and directories every app needs, copied verbatim. */
const SHARED = [
  "components",
  "lib",
  "supabase",
  "scripts",
  "public",
  "tests",
  "types",
  ".prettierrc",
  ".prettierignore",
  ".env.example",
  "eslint.config.mjs",
  "instrumentation.ts",
  "middleware.ts",
  "next.config.ts",
  "package.json",
  "package-lock.json",
  "playwright.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
  "vercel.json",
  "vitest.config.ts",
];

/** Root-level `app/` files every app needs. */
const SHARED_APP = [
  "layout.tsx",
  "globals.css",
  "error.tsx",
  "not-found.tsx",
  "favicon.ico",
  "(auth)",
];

/**
 * API surface per app. Deliberately minimal: a handler that is not reachable
 * from an app's UI is not shipped with it, so e.g. the admin deployment simply
 * has no dealer endpoints to attack.
 *
 * Every app keeps `auth/*` because every app has a sign-in page.
 */
const COMMON_API = ["auth/[...nextauth]", "auth/send-otp"];

const APPS = {
  "user-app": {
    surface: "user",
    group: "(user)",
    subdomain: "wheewise.com",
    description: "Buyer-facing Wheewise app — browse, compare, enquire, wishlist.",
    api: [...COMMON_API, "leads", "wishlist", "chat/conversations", "chat/messages"],
    // Only the public app should be indexed, and only it owns the sitemap.
    seo: "public",
    rootRedirect: null,
    // Route-handler tests are coupled to handlers that exist; only ship the
    // ones whose routes this app contains.
    routeTests: ["user-routes.test.ts"],
  },
  "dealer-app": {
    surface: "dealer",
    group: "(dealer)",
    subdomain: "dealer.wheewise.com",
    description: "Dealer console — inventory, leads, test drives, billing, storefront.",
    api: [
      ...COMMON_API,
      "ai/generate-description",
      "billing/checkout",
      "billing/webhook",
      "chat/conversations",
      "chat/messages",
      "dealer/api-keys",
      "dealer/boost",
      "dealer/boost/verify",
      "dealer/bulk-upload",
      "dealer/leads/unread-count",
      "gst/verify",
      "listings",
      "public/dealer",
      "public/listings",
      "rto",
      "uploads",
      "webhooks/razorpay",
    ],
    seo: "private",
    rootRedirect: "/dashboard",
    routeTests: ["dealer-routes.test.ts", "uploads-route.test.ts"],
  },
  "admin-app": {
    surface: "admin",
    group: "(admin)",
    subdomain: "admin.wheewise.com",
    description: "Wheewise admin console — dealers, buyers, moderation, payouts.",
    // Admin screens run entirely on server actions; no route handlers needed
    // beyond sign-in.
    api: [...COMMON_API],
    seo: "private",
    rootRedirect: "/admin",
    // Admin screens are server actions end to end — no route handlers to test
    // beyond sign-in, which Auth.js owns.
    routeTests: [],
  },
};

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyInto(from, toDir, name) {
  const src = path.join(SRC, from);
  if (!(await exists(src))) throw new Error(`missing source: ${from}`);
  await cp(src, path.join(toDir, name ?? from), { recursive: true });
}

const PRIVATE_ROBOTS = `import type { MetadataRoute } from "next";

/**
 * This app is a staff/dealer console, not public content. Nothing here should
 * ever appear in a search index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
`;

function rootRedirectPage(target) {
  return `import { redirect } from "next/navigation";

/**
 * This app is served on its own subdomain, so its root has no landing page of
 * its own — send visitors straight to the console. Authorization happens in
 * the target's layout, not here.
 */
export default function RootPage() {
  redirect("${target}");
}
`;
}

function readme(name, cfg) {
  return `# ${name}

${cfg.description}

Deployed to **https://${cfg.subdomain}**.

## This repo is generated

It is produced from the Wheewise monorepo by \`scripts/build-role-repos.mjs\`.
\`lib/\`, \`components/\`, \`supabase/\`, \`tests/\` and the build configuration are
**byte-identical** across \`user-app\`, \`dealer-app\` and \`admin-app\`; only
\`app/\` differs. Change shared code in the monorepo and regenerate, rather than
editing it here — otherwise the three repos drift apart.

What is unique to this repo:

- \`app/${cfg.group}/\` — this role's pages
- \`app/api/\` — only the ${cfg.api.length} route handlers this app actually calls
- \`app/robots.ts\` — ${cfg.seo === "public" ? "indexable" : "disallow all"}

## Local development

\`\`\`bash
npm install
cp .env.example .env      # then fill in the values below
npm run dev
\`\`\`

The database schema lives in \`supabase/schema.sql\`. Apply it once per Supabase
project (SQL editor, or \`npm run db:push\`) before the first boot.

## Environment variables

All three apps share **one Supabase project** and **one \`AUTH_SECRET\`**. A
session issued by any of them must verify in the other two.

| Variable | Required | Notes |
|---|---|---|
| \`NEXT_PUBLIC_SUPABASE_URL\` | yes | Same Supabase project for all three apps |
| \`NEXT_PUBLIC_SUPABASE_ANON_KEY\` | yes | Public; safe in the browser bundle |
| \`SUPABASE_SERVICE_ROLE_KEY\` | yes | **Server only** — bypasses RLS, never \`NEXT_PUBLIC_\` |
| \`AUTH_SECRET\` | yes | **Identical** across all three projects |
| \`AUTH_URL\` | yes | \`https://${cfg.subdomain}\` |
| \`AUTH_TRUST_HOST\` | yes | \`true\` on Vercel |
| \`AUTH_COOKIE_DOMAIN\` | yes | \`.wheewise.com\` — shares the session across subdomains |
| \`NEXT_PUBLIC_APP_URL\` | yes | \`https://${cfg.subdomain}\` |
| \`NEXT_PUBLIC_USER_APP_URL\` | yes | \`https://wheewise.com\` |
| \`NEXT_PUBLIC_DEALER_APP_URL\` | yes | \`https://dealer.wheewise.com\` |
| \`NEXT_PUBLIC_ADMIN_APP_URL\` | yes | \`https://admin.wheewise.com\` |

Feature-specific keys (\`BLOB_READ_WRITE_TOKEN\`, \`RAZORPAY_*\`, \`RESEND_*\`,
\`SUREPASS_TOKEN\`, …) are listed in \`.env.example\`; see
\`docs/deployment/VERCEL_SETUP.md\` for which app needs which.

## Security

Authorization is centralised in \`lib/rbac/\` and enforced server-side on every
request. See \`docs/security/SECURITY_REPORT.md\` and
\`docs/security/API_AUTHORIZATION_MATRIX.md\`.

\`\`\`bash
npm test          # unit suite + the authorization/security tests for this app
npm run typecheck
npm run lint
\`\`\`
`;
}

async function buildApp(name, cfg) {
  const dest = path.join(OUT_ROOT, name);
  // Regeneration wipes the tree, but two entries must survive it: `.git`
  // (the repo's history and remote) and `node_modules` (expensive to rebuild,
  // and on Windows it may be a junction into the monorepo's copy).
  const PRESERVE = new Set([".git", "node_modules"]);
  const hadGit = await exists(path.join(dest, ".git"));
  if (await exists(dest)) {
    const { readdir } = await import("node:fs/promises");
    for (const entry of await readdir(dest)) {
      if (PRESERVE.has(entry)) continue;
      await rm(path.join(dest, entry), { recursive: true, force: true });
    }
  }
  await mkdir(dest, { recursive: true });

  for (const item of SHARED) await copyInto(item, dest);

  // .gitignore is a dotfile and not part of SHARED, so copy it explicitly.
  // The inherited file ends with a blanket `.env*`, which would also swallow
  // `.env.example` — the one env file that must be committed, since it is how
  // a new deployment learns which variables exist. Re-include it after the
  // ignore rule (order matters: a negation must follow the pattern it undoes).
  const gitignore = await readFile(path.join(SRC, ".gitignore"), "utf8");
  await writeFile(
    path.join(dest, ".gitignore"),
    `${gitignore.trimEnd()}

# Documents required configuration — must be committed.
!.env.example
`,
    "utf8",
  );

  // Drop route-handler tests whose handlers this app does not ship.
  const routeTestDir = path.join(dest, "tests", "unit", "routes");
  if (await exists(routeTestDir)) {
    const { readdir } = await import("node:fs/promises");
    for (const file of await readdir(routeTestDir)) {
      if (!cfg.routeTests.includes(file)) {
        await rm(path.join(routeTestDir, file), { force: true });
      }
    }
    if (cfg.routeTests.length === 0) {
      await rm(routeTestDir, { recursive: true, force: true });
    }
  }

  const appDir = path.join(dest, "app");
  await mkdir(appDir, { recursive: true });
  for (const item of SHARED_APP) {
    await cp(path.join(SRC, "app", item), path.join(appDir, item), {
      recursive: true,
    });
  }

  // This role's pages.
  await cp(path.join(SRC, "app", cfg.group), path.join(appDir, cfg.group), {
    recursive: true,
  });

  // Only the API handlers this app calls.
  for (const route of cfg.api) {
    const from = path.join(SRC, "app", "api", route, "route.ts");
    const to = path.join(appDir, "api", route, "route.ts");
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to);
  }

  // SEO surface.
  if (cfg.seo === "public") {
    await cp(path.join(SRC, "app", "robots.ts"), path.join(appDir, "robots.ts"));
    await cp(path.join(SRC, "app", "sitemap.ts"), path.join(appDir, "sitemap.ts"));
  } else {
    await writeFile(path.join(appDir, "robots.ts"), PRIVATE_ROBOTS, "utf8");
  }

  if (cfg.rootRedirect) {
    await writeFile(
      path.join(appDir, "page.tsx"),
      rootRedirectPage(cfg.rootRedirect),
      "utf8",
    );
  }

  // Docs travel with every repo.
  await cp(path.join(SRC, "docs"), path.join(dest, "docs"), { recursive: true });

  // Name the package after the app so Vercel/npm show something meaningful.
  const pkgPath = path.join(dest, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  pkg.name = name;
  pkg.description = cfg.description;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

  await writeFile(path.join(dest, "README.md"), readme(name, cfg), "utf8");

  console.log(
    `${name.padEnd(12)} → ${path.relative(process.cwd(), dest)}  ` +
      `(${cfg.group}, ${cfg.api.length} api routes, ` +
      `${cfg.routeTests.length} route-test file(s))${hadGit ? "  [.git preserved]" : ""}`,
  );
}

await mkdir(OUT_ROOT, { recursive: true });
for (const [name, cfg] of Object.entries(APPS)) {
  await buildApp(name, cfg);
}
console.log(`\nDone. Output: ${OUT_ROOT}`);
