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
          {/* min-w-0: lets wide tables scroll inside their own wrapper instead of widening the page (see DashboardShell). */}
          <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 p-4 md:p-6">{children}</main>
          </div>
        </div>
      </ThemeProvider>
    </SessionProvider>
  );
}
