import { cookies, headers } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// Cloudflare Access's signed token, on requests to the paths it protects. The
// CF_Authorization cookie carries the same token and goes along with the rest.
const ACCESS_HEADER = "cf-access-jwt-assertion";

export async function adminFetch<T>(path: string): Promise<T | null> {
  const cookie = (await cookies()).toString();
  const access = (await headers()).get(ACCESS_HEADER);
  const forwarded: Record<string, string> = {};
  if (cookie) forwarded.Cookie = cookie;
  if (access) forwarded[ACCESS_HEADER] = access;
  try {
    const response = await fetch(`${API_URL}${path}`, { headers: forwarded, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
