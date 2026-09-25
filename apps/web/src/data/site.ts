export const siteConfig = {
  name: "PitchMyWeb",
  email: "support@claxonai.in",
};

export const navLinks = [
  { href: "/#how", label: "How it works" },
  { href: "/#samples", label: "Sample sites" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export const footerLinks = {
  product: [
    { href: "/#how", label: "How it works" },
    { href: "/#samples", label: "Sample sites" },
    { href: "/pricing", label: "Pricing" },
    { href: "/how-it-works", label: "How it works, in detail" },
  ],
  // Crawl paths into the SEO landing pages: every one is reachable from here
  // through its hub, not only from the sitemap.
  explore: [
    { href: "/for", label: "Industries" },
    { href: "/in", label: "Cities" },
    { href: "/guides", label: "Guides" },
  ],
  company: [
    { href: "/contact", label: "Contact" },
    { href: "/terms", label: "Terms" },
    { href: "/privacy", label: "Privacy" },
    { href: "/refunds", label: "Refunds" },
  ],
};
