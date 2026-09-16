import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma } from "../generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Example price ranges only (see backend_tasks.md section 11). These are the
// values an operator would tune later through the settings/services API,
// not values to hardcode elsewhere in the application.
const services: Prisma.ServiceCreateInput[] = [
  {
    code: "WEBSITE",
    name: "Website",
    description: "Personalized demo website built from a fixed template.",
    priceMin: 15000,
    priceMax: 25000,
  },
  {
    code: "WEBSITE_REDESIGN",
    name: "Website Redesign",
    description: "Modernization of an existing outdated website.",
    priceMin: 12000,
    priceMax: 20000,
  },
  {
    code: "WHATSAPP",
    name: "WhatsApp Business Setup",
    description: "WhatsApp-ready customer communication channel.",
    priceMin: 5000,
    priceMax: 10000,
  },
  {
    code: "REVIEWS",
    name: "Review Automation",
    description: "Automated review collection and reputation management.",
    priceMin: 4000,
    priceMax: 8000,
  },
  {
    code: "SEO",
    name: "Local SEO",
    description: "Local search visibility optimization.",
    priceMin: 6000,
    priceMax: 15000,
  },
  {
    code: "AI_CHATBOT",
    name: "AI Chatbot",
    description: "AI-powered website/WhatsApp chat assistant.",
    priceMin: 10000,
    priceMax: 20000,
  },
  {
    code: "AI_VOICE_AGENT",
    name: "AI Voice Agent",
    description: "AI-powered phone answering and booking agent.",
    priceMin: 20000,
    priceMax: 35000,
  },
  {
    code: "APPOINTMENT_SYSTEM",
    name: "Appointment Booking System",
    description: "Online appointment scheduling integration.",
    priceMin: 8000,
    priceMax: 15000,
  },
  {
    code: "DIGITAL_MENU",
    name: "Digital Menu",
    description: "QR-code driven digital menu for food businesses.",
    priceMin: 3000,
    priceMax: 6000,
  },
  {
    code: "POS",
    name: "Point of Sale System",
    description: "Point-of-sale and billing integration.",
    priceMin: 15000,
    priceMax: 30000,
  },
];

// Fictional demo businesses only (no real-world factual claims). Each case
// below deliberately exercises one or more scenarios called out in
// backend_tasks.md section 21: no website, existing website, strong
// reviews, weak digital presence, social presence, missing contact info.
const businesses: Array<
  Omit<Prisma.BusinessCreateInput, "source" | "externalId"> & {
    externalId: string;
  }
> = [
  {
    externalId: "demo-001",
    name: "Lakshmi Dental Care",
    category: "Dental Clinic",
    address: "12 MG Road",
    city: "Chennai",
    phone: "+91-9800000001",
    email: "contact@lakshmidental.example.com",
    website: null,
    instagram: null,
    facebook: null,
    rating: 4.8,
    reviewCount: 240,
    latitude: 13.0827,
    longitude: 80.2707,
  },
  {
    externalId: "demo-002",
    name: "Spice Junction Restaurant",
    category: "Restaurant",
    address: "45 Brigade Road",
    city: "Bengaluru",
    phone: "+91-9800000002",
    email: "hello@spicejunction.example.com",
    website: "https://spicejunctionrestaurant.example.com",
    instagram: "https://instagram.com/spicejunction.example",
    facebook: null,
    rating: 4.2,
    reviewCount: 85,
    latitude: 12.9716,
    longitude: 77.5946,
  },
  {
    externalId: "demo-003",
    name: "Glow & Go Salon",
    category: "Hair Salon",
    address: "8 Banjara Hills Road",
    city: "Hyderabad",
    phone: "+91-9800000003",
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 3.1,
    reviewCount: 6,
    latitude: 17.385,
    longitude: 78.4867,
  },
  {
    externalId: "demo-004",
    name: "Prime Auto Works",
    category: "Auto Repair",
    address: "22 FC Road",
    city: "Pune",
    phone: null,
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: 3.9,
    reviewCount: 22,
    latitude: 18.5204,
    longitude: 73.8567,
  },
  {
    externalId: "demo-005",
    name: "Chandra & Associates Law Firm",
    category: "Law Firm",
    address: "5 Connaught Place",
    city: "Delhi",
    phone: "+91-9800000005",
    email: "info@chandralaw.example.com",
    website: "https://chandralaw.example.com",
    instagram: null,
    facebook: "https://facebook.com/chandralaw.example",
    rating: 4.6,
    reviewCount: 120,
    latitude: 28.6315,
    longitude: 77.2167,
  },
  {
    externalId: "demo-006",
    name: "IronCore Fitness Gym",
    category: "Fitness Gym",
    address: "31 Andheri West",
    city: "Mumbai",
    phone: "+91-9800000006",
    email: "join@ironcorefitness.example.com",
    website: null,
    instagram: "https://instagram.com/ironcorefitness.example",
    facebook: "https://facebook.com/ironcorefitness.example",
    rating: 4.0,
    reviewCount: 45,
    latitude: 19.076,
    longitude: 72.8777,
  },
  {
    externalId: "demo-007",
    name: "Sunrise Bakery",
    category: "Bakery",
    address: "3 Anna Nagar",
    city: "Chennai",
    phone: "+91-9800000007",
    email: null,
    website: null,
    instagram: null,
    facebook: null,
    rating: null,
    reviewCount: null,
    latitude: 13.0827,
    longitude: 80.2707,
  },
  {
    externalId: "demo-008",
    name: "Serenity Yoga Studio",
    category: "Yoga Studio",
    address: "17 Indiranagar",
    city: "Bengaluru",
    phone: "+91-9800000008",
    email: "namaste@serenityyoga.example.com",
    website: "https://serenityyoga.example.com",
    instagram: null,
    facebook: null,
    rating: 4.5,
    reviewCount: 60,
    latitude: 12.9716,
    longitude: 77.5946,
  },
];

async function main() {
  for (const service of services) {
    await prisma.service.upsert({
      where: { code: service.code },
      create: service,
      update: service,
    });
  }
  console.log(`Seeded ${services.length} services.`);

  for (const { externalId, ...rest } of businesses) {
    await prisma.business.upsert({
      where: { source_externalId: { source: "demo", externalId } },
      create: { ...rest, source: "demo", externalId },
      update: { ...rest, source: "demo", externalId },
    });
  }
  console.log(`Seeded ${businesses.length} demo businesses.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
