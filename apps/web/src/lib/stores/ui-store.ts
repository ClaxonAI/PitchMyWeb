import { create } from "zustand";
import { persist } from "zustand/middleware";

// The only piece of dashboard client state that genuinely benefits from a
// store: whether the sidebar is collapsed, persisted across reloads. Every
// other page's data comes from a server-component fetch per navigation
// (matching this app's existing pattern) — do not add more state here
// unless a genuine cross-page client concern shows up (e.g. a live
// unread-activity badge); most "state" belongs to the URL or the server.
export type UiStore = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
};

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    }),
    { name: "pmw-dashboard-ui" },
  ),
);
