"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Switch } from "@/components/dashboard-ui/switch";
import { Label } from "@/components/dashboard-ui/label";

export function DarkModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // See Topbar.tsx's own comment: resolvedTheme is only known client-side,
  // so this avoids a server/client hydration mismatch on first render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex items-center justify-between">
      <Label htmlFor="dark-mode">Dark mode</Label>
      <Switch id="dark-mode" checked={mounted && resolvedTheme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
    </div>
  );
}
