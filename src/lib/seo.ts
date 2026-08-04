const BRAND = "GameFlex";
const DEFAULT_DESCRIPTION =
  "The world's premier gaming ecosystem. Discover the complete gaming experience on one platform.";

export function pageSeo({ title, description }: { title?: string; description?: string } = {}) {
  const clean = title?.replace(/\s*\|\s*GameFlex.*$/i, "").trim();
  const fullTitle = clean || "The World's Premier Gaming Ecosystem";
  const desc = description || DEFAULT_DESCRIPTION;
  return {
    meta: [
      { title: fullTitle },
      { name: "description", content: desc },
      { property: "og:title", content: `${fullTitle} | ${BRAND}` },
      { property: "og:description", content: desc },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
