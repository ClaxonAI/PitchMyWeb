export const siteConfig = {
  name: "PitchMyWeb",
  email: "claxonai@gmail.com",
  // The business behind PitchMyWeb, as Razorpay and the legal pages need it.
  legalName: "Claxon AI",
  phone: "+91 91762 74991",
  phoneHref: "tel:+919176274991",
  address: {
    lines: ["Sathyabama Startup Cell (incubatee)", "Sathyabama Institute of Science and Technology", "Jeppiaar Nagar, Rajiv Gandhi Salai"],
    locality: "Chennai",
    region: "Tamil Nadu",
    postalCode: "600119",
    country: "IN",
  },
  // Required by the DPDP Act 2023 and the IT Rules 2021; shown on /privacy.
  grievanceOfficer: { name: "Nitin P" as string | null, designation: "Founder" as string | null, email: "claxonai@gmail.com" },
};

/** The postal address on one line, for legal pages and structured data. */
export const postalAddress = [
  ...siteConfig.address.lines,
  `${siteConfig.address.locality}, ${siteConfig.address.region} ${siteConfig.address.postalCode}`,
  "India",
].join(", ");

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
