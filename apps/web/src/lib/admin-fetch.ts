import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export async function adminFetch<T>(path: string): Promise<T | null> {
  const cookie = (await cookies()).toString();
  try {
    const response = await fetch(`${API_URL}${path}`, { headers: cookie ? { Cookie: cookie } : {}, cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
