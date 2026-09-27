import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";

// Outside the (marketing) group, so it brings the site's chrome itself: a
// visitor who followed a dead link keeps the navigation and a few ways in,
// rather than a single "home" button on a bare page.
const PLACES = [
  { href: "/pricing", label: "Pricing" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/guides", label: "Guides" },
  { href: "/for", label: "Industries" },
];

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="py-24 lg:py-36">
          <Container className="text-center">
            <p className="eyebrow text-primary">404</p>
            <h1 className="display mx-auto mt-4 max-w-xl text-5xl sm:text-6xl">This page never got pitched.</h1>
            <p className="mt-5 text-ink/60">The link may be old, or the page may have moved.</p>
            <Button href="/" variant="dark" arrow className="mt-8">
              Back to home
            </Button>
            <nav aria-label="Popular pages" className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3 text-[14px]">
              {PLACES.map((place) => (
                <Link key={place.href} href={place.href} className="inline-flex min-h-11 items-center text-ink/70 underline-offset-4 hover:text-primary hover:underline">
                  {place.label}
                </Link>
              ))}
            </nav>
          </Container>
        </section>
      </main>
      <Footer />
    </div>
  );
}
