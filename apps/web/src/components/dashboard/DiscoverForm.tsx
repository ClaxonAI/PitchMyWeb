"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageCircle, Search } from "lucide-react";
import type { z } from "zod";
import { campaignFormSchema } from "@/lib/schemas/campaign-create";
import { ApiError, campaignsApi, whatsappApi } from "@/lib/api-client";
import { DEFAULT_MESSAGE_TEMPLATE, messageTemplateProblem } from "@/lib/message-template";
import { Button } from "@/components/dashboard-ui/button";
import { Card, CardContent } from "@/components/dashboard-ui/card";
import { Input } from "@/components/dashboard-ui/input";
import { Label } from "@/components/dashboard-ui/label";
import { Select } from "@/components/dashboard-ui/select";
import { MessageTemplateEditor } from "./MessageTemplateEditor";
import { useSession } from "./SessionProvider";

export function DiscoverForm() {
  const router = useRouter();
  const { canDiscover, hasPaidAccess, allowedMarkets, availableCredits, reservedCredits, whatsappConnected: connectedAtLoad } = useSession();
  // Pitches go out from the user's own WhatsApp, so a campaign cannot start
  // without it. Re-checked on mount: the session the layout loaded can be
  // older than a link the user just finished on the WhatsApp page.
  const [whatsappConnected, setWhatsappConnected] = useState(connectedAtLoad);
  useEffect(() => {
    whatsappApi
      .listAccounts()
      .then(({ items }) => setWhatsappConnected(items.some((account) => account.status === "CONNECTED")))
      .catch(() => undefined);
  }, []);
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_MESSAGE_TEMPLATE);
  // How many leads to *find*, which costs no credits — so the balance no
  // longer caps this field. It only suggests a sensible default: there is
  // little point scraping far past what the account could ever pitch.
  const MAX_TARGET_COUNT = 200;
  const defaultTargetCount = Math.min(20, Math.max(1, availableCredits + reservedCredits));
  const [nlQuery, setNlQuery] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [parseHint, setParseHint] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof campaignFormSchema>, unknown, z.output<typeof campaignFormSchema>>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: { market: allowedMarkets[0] ?? "india", targetCount: defaultTargetCount },
  });

  async function onSubmit(values: z.output<typeof campaignFormSchema>) {
    setSubmitError(null);
    const messageProblem = messageTemplateProblem(messageTemplate);
    if (messageProblem) {
      setSubmitError(`WhatsApp message: ${messageProblem}`);
      return;
    }
    try {
      // Only businesses without a website are searched: that is who needs one.
      const campaign = await campaignsApi.create({
        ...values,
        websiteRequirement: "WITHOUT_WEBSITE",
        selectionMode: "AUTO",
        deliveryMode: "AUTO",
        messageTemplate: messageTemplate.trim(),
      });
      await campaignsApi.update(campaign.id, { status: "READY" });
      await campaignsApi.run(campaign.id);
      router.push(`/campaigns/${campaign.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === "PAYMENT_REQUIRED") {
        router.push("/pricing");
        return;
      }
      if (error instanceof ApiError && error.code === "WHATSAPP_NOT_CONNECTED") {
        setWhatsappConnected(false);
        return;
      }
      setSubmitError(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  }

  async function onParse() {
    const query = nlQuery.trim();
    if (!query) return;
    setParsing(true);
    setParseHint(null);
    try {
      const result = await campaignsApi.parseQuery(query);
      if (!result.parsed) {
        setParseHint(
          result.reason === "not_configured"
            ? "Natural-language search isn’t configured on this server."
            : "Couldn’t read that. Fill the form below instead.",
        );
        return;
      }
      const parsed = result.parsed;
      if (parsed.category) setValue("category", parsed.category);
      if (parsed.location) setValue("location", parsed.location);
      if (parsed.minRating != null) setValue("minRating", parsed.minRating);
      if (parsed.minReviews != null) setValue("minReviews", parsed.minReviews);
      if (parsed.targetCount != null) {
        setValue("targetCount", Math.min(parsed.targetCount, MAX_TARGET_COUNT));
      }
    } catch (error) {
      setParseHint(error instanceof ApiError ? error.message : "Couldn’t parse that right now.");
    } finally {
      setParsing(false);
    }
  }

  if (!canDiscover) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-5">
          <p className="text-sm text-dash-foreground">
            You&apos;re out of pitch credits. {hasPaidAccess ? "Buy another credit pack" : "Buy a credit pack"} to search for more businesses without a
            website.
          </p>
          <Button asChild>
            <Link href="/pricing">View pricing</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!whatsappConnected) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-4 p-6">
          <span className="grid size-11 place-items-center rounded-full bg-dash-success/15 text-dash-success">
            <MessageCircle className="size-5" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="text-lg font-semibold text-dash-foreground">Connect your WhatsApp first</h2>
            <p className="max-w-prose text-sm text-dash-muted-foreground">
              Every pitch — the message and both demo videos — is sent from your own WhatsApp number, so each campaign starts by linking it. It takes
              about a minute: scan a QR code from WhatsApp → Linked devices. When the campaign has finished, PitchMyWeb unlinks itself again.
            </p>
          </div>
          <Button asChild>
            <Link href="/whatsapp">
              <MessageCircle /> Connect WhatsApp
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-dash-muted-foreground">
        {availableCredits} pitch {availableCredits === 1 ? "credit" : "credits"} available. Searching costs nothing — you choose how many of the leads to
        pitch once you can see them.
      </p>
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <Label htmlFor="nl-search">Describe what you&apos;re looking for</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-dash-muted-foreground" />
              <Input
                id="nl-search"
                value={nlQuery}
                onChange={(event) => setNlQuery(event.target.value)}
                placeholder="Find dental clinics in Chennai without websites"
                className="pl-9"
              />
            </div>
            <Button type="button" variant="secondary" disabled={parsing || !nlQuery.trim()} onClick={() => void onParse()}>
              {parsing ? "Reading…" : "Search"}
            </Button>
          </div>
          <p className="text-xs text-dash-muted-foreground">
            Search fills the form from your sentence. Nothing is scraped until you press Find businesses and pitch.
          </p>
          {parseHint && <p className="text-xs text-dash-muted-foreground">{parseHint}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="name">Campaign name</Label>
              <Input id="name" placeholder="Dental clinics — Chennai" {...register("name")} />
              {errors.name && <p className="text-xs text-dash-destructive">{errors.name.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="market">Lead market</Label>
              <Select id="market" {...register("market")}>
                {allowedMarkets.includes("india") && <option value="india">India</option>}
                {allowedMarkets.includes("foreign") && <option value="foreign">Foreign</option>}
              </Select>
              <p className="text-xs text-dash-muted-foreground">Your purchase only unlocks its selected market.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Input id="category" placeholder="Dental Clinic" {...register("category")} />
              {errors.category && <p className="text-xs text-dash-destructive">{errors.category.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location">Location</Label>
              <Input id="location" placeholder="Chennai" {...register("location")} />
              {errors.location && <p className="text-xs text-dash-destructive">{errors.location.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetCount">How many leads</Label>
              <Input id="targetCount" type="number" min={1} max={MAX_TARGET_COUNT} {...register("targetCount")} />
              {errors.targetCount && <p className="text-xs text-dash-destructive">{errors.targetCount.message}</p>}
              <p className="text-xs text-dash-muted-foreground">
                We search for exactly this many businesses. Any without a number WhatsApp can reach are listed but not pitched.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="minRating">Minimum rating (optional)</Label>
              <Input id="minRating" type="number" step="0.1" min={0} max={5} {...register("minRating")} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="minReviews">Minimum reviews (optional)</Label>
              <Input id="minReviews" type="number" min={0} {...register("minReviews")} />
            </div>

            <div className="border-t border-dash-border pt-4 sm:col-span-2">
              <MessageTemplateEditor value={messageTemplate} onChange={setMessageTemplate} />
            </div>

            {submitError && <p className="text-sm text-dash-destructive sm:col-span-2">{submitError}</p>}

            <div className="sm:col-span-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Starting…" : "Find businesses and pitch"}
              </Button>
              <p className="mt-2 text-xs text-dash-muted-foreground">
                We find businesses without a website, build each one a sample site, record it on a phone and a laptop, and send your message with both
                videos from your WhatsApp. You can pause sending at any time.
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}