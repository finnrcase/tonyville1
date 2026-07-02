import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CABN",
    short_name: "CABN",
    description: "Intelligent property planning for backyard rooms.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f3ee",
    theme_color: "#22402f",
    icons: [
      {
        src: "/icons/cabn-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/cabn-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/cabn-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
