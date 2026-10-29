import type { MetadataRoute } from "next";

// Lets Chrome on Android install the app to the home screen with its own icon,
// opening full-screen without the browser bar.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kalorie posiłków",
    short_name: "Kalorie",
    description: "Zapisuj składniki posiłków i licz ich wartości odżywcze z pomocą AI.",
    lang: "pl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f4",
    theme_color: "#2f7d4f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
