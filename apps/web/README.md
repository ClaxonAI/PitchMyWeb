# PitchMyWeb — frontend

Marketing site, pricing flow and dashboard for PitchMyWeb: find local businesses with no website, build each
one a sample site and demo, and pitch it from the freelancer's own WhatsApp.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · lucide-react

Run everything from the monorepo root — this app has no lockfile or `node_modules` of its own.

```bash
npm install
npm run dev:web   # http://localhost:3000
npm run lint
npm run build:web
```

`next.config.ts` rewrites `/api/*` to `API_URL` (default `http://localhost:4000`), so the API is
same-origin in the browser. That is what lets the session cookie stay HttpOnly + SameSite=Lax and lets
`EventSource` authenticate at all — it cannot set headers. Start the API (`npm run dev:api`) alongside
this app, and the worker (`npm run dev:worker`) for anything WhatsApp.

## Project structure

```
src/
├── app/                      # Routes (one folder per page)
│   ├── layout.tsx            # Fonts, metadata, announcement bar, navbar, footer
│   ├── globals.css           # Design tokens (@theme) + base styles
│   ├── page.tsx              # Home: composes the sections in components/home
│   ├── pricing/              # Plans + checkout flow
│   ├── login/  register/     # Minimal auth forms against the existing auth routes
│   ├── dashboard/whatsapp/   # Link a number, send a test message, watch delivery
│   ├── contact/  terms/  privacy/  refunds/
│   ├── not-found.tsx
│   └── icon.svg              # Favicon
├── components/
│   ├── ui/                   # Primitives: Button, Badge, Card, Container,
│   │                         # SectionHeading, Accordion, SegmentedControl
│   ├── layout/               # Navbar, Footer, AnnouncementBar, Logo, LegalPage
│   ├── mocks/                # CSS-rendered product visuals: SitePreview, ChatBits
│   ├── home/                 # One file per landing-page section
│   ├── pricing/              # PlanGrid, PlanCard, CheckoutDialog, CountrySelect,
│   │                         # CouponField, LinkedDevicesMock, LinkPackMock, AfterPayment
│   ├── auth/                 # AuthForm (shared by /login and /register)
│   ├── dashboard/            # WhatsAppPanel, LinkPanel, ConnectedCard, ConnectionStepper,
│   │                         # TestMessageForm, MessagesTable, useWhatsAppSession
│   └── contact/              # ContactForm
├── data/                     # All copy, prices and content (edit these, not components)
│   ├── plans.ts              # Plans, batch prices (USD), demo coupons
│   ├── countries.ts          # Foreign markets + approximate INR rates
│   ├── faq.ts  testimonials.ts  sampleSites.ts  site.ts (nav, footer, email)
├── lib/utils.ts              # cn(), formatMoney(), formatInr()
├── lib/api-client.ts         # Typed fetch wrapper; ApiError keeps the machine-readable code
└── types/index.ts            # Shared types
```

Server components by default; `"use client"` only where there is state (navbar menu, hero chat animation,
calculator, pricing cards, accordion, contact form).

## Design system

Palette taken from brandthis.in. All tokens live in `src/app/globals.css` under `@theme`, so they are
available as Tailwind utilities (`bg-primary`, `text-ink`, `bg-mist`, `rounded-card`, `shadow-glow`…).

| Token           | Value     | Use                                  |
| --------------- | --------- | ------------------------------------ |
| `primary`       | `#3336CD` | Main accent, primary CTAs            |
| `violet/lilac`  | `#6C4CFF` / `#9B8AFF` | Glows, accents on dark       |
| `ink`           | `#0A0A0A` | Text, dark buttons and sections      |
| `mist` (1–4)    | `#F6F2FF` … | Soft section backgrounds           |
| `lime`          | `#C9F27A` | Rare highlight ("Most popular", NEW) |
| `coral`         | `#FF6D5F` | Rare warning ("No website")          |

Type: **Fraunces** (display headings, `.display`) + **Inter** (UI/body) + system mono for eyebrows and data.

> Tailwind v4 has no `tailwind.config.ts`; theme changes go in `globals.css`.

## What is simulated (to wire up later)

- **Payments:** `CheckoutDialog.confirm()` is a stub. Create the order server-side and redirect to your
  payment provider there.
- **Coupons:** `demoCoupons` in `data/plans.ts` (`FIRSTPITCH` = 20%, `LAUNCH50` = 50%). Validate server-side for real.
- **WhatsApp linking / link packs:** `LinkedDevicesMock` and `LinkPackMock` on the *pricing page* are still
  interactive previews. The real thing lives at `/dashboard/whatsapp` and talks to the API and worker.
- **Contact form:** opens the visitor's mail app (`mailto:`). Replace `handleSubmit` with an API call.
- **Exchange rates:** hard-coded in `data/countries.ts`.

## Before launch

- Replace the placeholder testimonials in `data/testimonials.ts` with real, attributable quotes.
- Have a lawyer review the Terms, Privacy and Refund pages (currently drafts).
- Confirm prices in `data/plans.ts` and the support email in `data/site.ts`.
