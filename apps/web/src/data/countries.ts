import type { Country } from "@/types";

// Approximate rates for display only. Refresh from an FX API before launch.
export const countries: Country[] = [
  { code: "US", name: "United States", currency: "USD", inrRate: 86, typicalSitePrice: 800 },
  { code: "GB", name: "United Kingdom", currency: "GBP", inrRate: 116, typicalSitePrice: 650 },
  { code: "AE", name: "United Arab Emirates", currency: "AED", inrRate: 23.4, typicalSitePrice: 2500 },
  { code: "AU", name: "Australia", currency: "AUD", inrRate: 56, typicalSitePrice: 1200 },
  { code: "CA", name: "Canada", currency: "CAD", inrRate: 62, typicalSitePrice: 1000 },
  { code: "KW", name: "Kuwait", currency: "KWD", inrRate: 281, typicalSitePrice: 250 },
  { code: "SA", name: "Saudi Arabia", currency: "SAR", inrRate: 22.9, typicalSitePrice: 2800 },
  { code: "SG", name: "Singapore", currency: "SGD", inrRate: 66, typicalSitePrice: 1100 },
  { code: "DE", name: "Germany", currency: "EUR", inrRate: 100, typicalSitePrice: 750 },
];

export function findCountry(code: string) {
  return countries.find((c) => c.code === code) ?? countries[0];
}
