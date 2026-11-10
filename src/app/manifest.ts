import type { MetadataRoute } from "next";
import hy from "../../messages/hy.json";

// The staff app (kitchen screen, waiter tablet) installs from this manifest
// (ADR-029, ADR-048). It opens at /pair?source=app, which the service worker
// turns into the last staff screen this device showed, online or offline;
// a device that was never paired gets the pairing page. Armenian, the
// reference language: the manifest can't follow each member's setting.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/?app=staff",
    name: hy.brand.name,
    short_name: hy.brand.name,
    description: hy.brand.staffApp,
    lang: "hy",
    dir: "ltr",
    start_url: "/pair?source=app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FBFCF8",
    theme_color: "#1D6A43",
    categories: ["food", "business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
