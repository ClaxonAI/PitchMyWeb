import { redirect } from "next/navigation";

// Profile is part of Settings now (settings/page.tsx). Kept so the avatar
// menu, old links and bookmarks still land there.
export default function ProfilePage() {
  redirect("/settings");
}
