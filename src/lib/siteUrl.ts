/**
 * Absolute base URL for the deployed site.
 *
 * Used by `robots.ts` and `sitemap.ts`, which must emit fully-qualified URLs.
 * Prefers an explicit `NEXT_PUBLIC_SITE_URL`, falls back to the Vercel-provided
 * production domain, then to localhost for local development.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}
