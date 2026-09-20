import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";

// Everything that used to live in the true root layout.tsx before the
// Phase 1 dashboard rebuild split routes into (marketing) and (dashboard)
// groups — marketing pages keep exactly the same chrome and URLs they had
// before; only the wrapper moved down one level.
export default function MarketingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AnnouncementBar />
      <Navbar />
      <main className="flex-1 pb-16">{children}</main>
      <Footer />
    </div>
  );
}
