"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { siteConfig } from "@/data/site";
import { cn } from "@/lib/utils";

const topics = ["Choosing a plan", "A batch I bought", "Refunds", "Partnerships", "Something else"];

const fieldClass =
  "w-full rounded-2xl border border-ink/10 bg-white px-4 text-[15px] outline-none transition placeholder:text-ink/60 focus:border-primary focus:ring-4 focus:ring-primary/10";

/**
 * Opens the visitor's email app with the message pre-filled.
 * Swap `handleSubmit` for an API call when a backend exists.
 */
export function ContactForm() {
  const [topic, setTopic] = useState(topics[0]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const subject = `[${topic}] from ${data.get("name")}`;
    const body = `${data.get("message")}\n\n— ${data.get("name")} (${data.get("email")})`;
    window.location.href = `mailto:${siteConfig.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <fieldset>
        <legend className="text-[13px] font-medium text-ink/70">What is it about?</legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {topics.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={topic === t}
              onClick={() => setTopic(t)}
              className={cn(
                "min-h-11 rounded-full border px-4 py-2 text-[13px] transition",
                topic === t
                  ? "border-primary bg-primary text-white"
                  : "border-ink/10 text-ink/60 hover:border-ink/25 hover:text-ink",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-[13px] font-medium text-ink/70">Name</span>
          <input name="name" required autoComplete="name" className={cn(fieldClass, "mt-2 h-12")} />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-ink/70">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className={cn(fieldClass, "mt-2 h-12")}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[13px] font-medium text-ink/70">Message</span>
        <textarea
          name="message"
          required
          rows={5}
          placeholder="Tell us what you need help with"
          className={cn(fieldClass, "mt-2 resize-none py-3")}
        />
      </label>

      <Button type="submit" variant="dark" size="lg" arrow className="w-full sm:w-auto">
        Send message
      </Button>
    </form>
  );
}
