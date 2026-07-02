import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/siteUrl";

// Public, cold-landable entry points only. Deeper flow steps (place-room,
// customize-room, edit-cabn, review-cabn-plan) require prior selection state,
// and admin/auth routes are intentionally excluded via robots.ts.
const PUBLIC_ROUTES: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  { path: "/find-land", priority: 0.8 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const lastModified = new Date();

  return PUBLIC_ROUTES.map(({ path, priority }) => ({
    url: `${siteUrl}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency: "monthly",
    priority,
  }));
}
