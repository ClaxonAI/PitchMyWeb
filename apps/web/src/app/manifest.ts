import type { MetadataRoute } from "next";

// Lets "Add to Home Screen" show the name and icon properly, and gives the
// browser chrome its colour. The dashboard is the useful place to land.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PitchMyWeb",
    short_name: "PitchMyWeb",
    description: "Find local businesses without a website, build each a sample site, and pitch it on WhatsApp.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
