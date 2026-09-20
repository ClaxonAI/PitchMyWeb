import type { SessionUser } from "@/lib/auth/require-session";
import { SessionProvider } from "@/components/dashboard/SessionProvider";
import { ThemeProvider } from "@/components/dashboard/ThemeProvider";
import { Topbar } from "@/components/dashboard/Topbar";
import { AdminSidebar } from "./AdminSidebar";

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return (
    <SessionProvider user={user}>
      <ThemeProvider>
        <div className="dashboard-shell flex">
          <AdminSidebar />
          <div className="flex min-h-dvh flex-1 flex-col">
            <Topbar />
            <main className="flex-1 p-4 md:p-6">{children}</main>
          </div>
        </div>
      </ThemeProvider>
    </SessionProvider>
  );
}
