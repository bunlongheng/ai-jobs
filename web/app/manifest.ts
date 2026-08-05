import type { MetadataRoute } from "next";

// PWA manifest -> proper "Add to Home Screen" (standalone app icon, splash, theme).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI-Jobs",
    short_name: "AI-Jobs",
    description: "Job-hunt pipeline - find, score, tailor, apply, track",
    start_url: "/jobs",
    display: "standalone",
    background_color: "#f6f8fa",
    theme_color: "#16a34a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
