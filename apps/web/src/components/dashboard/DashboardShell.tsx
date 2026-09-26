import type { SessionUser } from "@/lib/auth/require-session";
import { SessionProvider } from "./SessionProvider";
import { ThemeProvider } from "./ThemeProvider";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileTabBar } from "./MobileTabBar";

export function DashboardShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <SessionProvider user={user}>
      <ThemeProvider>
        <div className="dashboard-shell flex">
          <Sidebar />
          {/* min-w-0: a flex item will not shrink below its widest child
              otherwise, so a wide table widened the whole page on a phone
              instead of scrolling inside its own overflow-x-auto wrapper. */}
          <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 p-4 md:p-6">{children}</main>
            <MobileTabBar />
          </div>
        </div>
      </ThemeProvider>
    </SessionProvider>
  );
}
