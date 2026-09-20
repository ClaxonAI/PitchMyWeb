"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, meApi, type Me } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";
import { Input } from "@/components/dashboard-ui/input";
import { Label } from "@/components/dashboard-ui/label";

export function ProfileForm({ initialMe }: { initialMe: Me }) {
  const router = useRouter();
  const [name, setName] = useState(initialMe.name ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      await meApi.update({ name: name.trim().length > 0 ? name.trim() : null });
      setSuccess(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={initialMe.email} disabled />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Display name</Label>
        <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
      </div>
      {error && <p className="text-sm text-dash-destructive">{error}</p>}
      {success && <p className="text-sm text-dash-success">Saved.</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
