import Link from "next/link";
import { Logo } from "@/components/layout/Logo";
import { Container } from "@/components/ui/Container";
import { footerLinks, siteConfig } from "@/data/site";

function LinkColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="eyebrow text-white/30">{title}</p>
      <ul className="mt-5 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="group inline-flex items-center gap-1 text-sm text-white/55 transition-colors duration-200 hover:text-white"
            >
              <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                {link.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-ink text-white">
      <Container className="grid gap-12 pt-16 pb-12 md:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <Logo tone="dark" />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/40">
            We find the businesses, build their sites and help you pitch them. You answer the replies.
          </p>
          <a
            href={`mailto:${siteConfig.email}`}
            className="group mt-6 inline-flex items-center gap-1.5 text-sm text-lilac transition-colors hover:text-lilac/80"
          >
            <span className="underline underline-offset-4 decoration-lilac/40 group-hover:decoration-lilac/70 transition-all">
              {siteConfig.email}
            </span>
          </a>
        </div>
        <LinkColumn title="Product" links={footerLinks.product} />
        <LinkColumn title="Company" links={footerLinks.company} />
      </Container>

      {/* Oversized watermark */}
      <Container className="overflow-hidden">
        <p
          aria-hidden
          className="display -mb-[0.22em] text-center text-[19vw] leading-none text-white/[0.04] select-none lg:text-[210px]"
        >
          PitchMyWeb
        </p>
      </Container>

      <div className="border-t border-white/6">
        <Container className="flex flex-col gap-2 py-5 font-mono text-[11px] tracking-wide text-white/25 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} PitchMyWeb</span>
          <span>Made for freelancers who would rather show than tell.</span>
        </Container>
      </div>
    </footer>
  );
}
