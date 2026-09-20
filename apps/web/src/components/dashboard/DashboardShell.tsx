import type { SessionUser } from "@/lib/auth/require-session";
import { SessionProvider } from "./SessionProvider";
import { ThemeProvider } from "./ThemeProvider";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function DashboardShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <SessionProvider user={user}>
      <ThemeProvider>
        <div className="dashboard-shell flex">
          <Sidebar />
          <div className="flex min-h-dvh flex-1 flex-col">
            <Topbar />
            <main className="flex-1 p-4 md:p-6">{children}</main>
          </div>
        </div>
      </ThemeProvider>
    </SessionProvider>
  );
}
