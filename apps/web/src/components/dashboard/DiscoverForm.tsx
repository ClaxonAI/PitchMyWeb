"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search } from "lucide-react";
import type { z } from "zod";
import { campaignFormSchema } from "@/lib/schemas/campaign-create";
import { ApiError, campaignsApi, whatsappApi } from "@/lib/api-client";
import { Button } from "@/components/dashboard-ui/button";
import { Card, CardContent } from "@/components/dashboard-ui/card";
import { Input } from "@/components/dashboard-ui/input";
import { Label } from "@/components/dashboard-ui/label";
import { Select } from "@/components/dashboard-ui/select";
import { useSession } from "./SessionProvider";

const DEFAULT_MESSAGE_TEMPLATE = `Hi {{business_name}} team,

I noticed {{business_name}} doesn't have a website yet, so I put together a free sample site to show what it could look like: {{site_link}}

If you like it, I can make it live with your photos, timings and booking details. Happy to share more?`;

export function DiscoverForm() {
  const router = useRouter();
  const { canDiscover, hasPaidAccess, allowedMarkets, availableCredits, reservedCredits } = useSession();
  // How many leads to *find*, which costs no credits — so the balance no
  // longer caps this field. It only suggests a sensible default: there is
  // little point scraping far past what the account could ever pitch.
  const MAX_TARGET_COUNT = 200;
  const defaultTargetCount = Math.min(20, Math.max(1, availableCredits + reservedCredits));
  const [nlQuery, setNlQuery] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [parseHint, setParseHint] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(null);
  const [showConnectionChoice, setShowConnectionChoice] = useState(false);
  const [continueWithoutWhatsApp, setContinueWithoutWhatsApp] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof campaignFormSchema>, unknown, z.output<typeof campaignFormSchema>>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      market: allowedMarkets[0] ?? "india",
      websiteRequirement: "WITHOUT_WEBSITE",
      targetCount: defaultTargetCount,
      messageTemplate: DEFAULT_MESSAGE_TEMPLATE,
    },
  });

  useEffect(() => {
    void whatsappApi
      .listAccounts()
      .then(({ items }) => setWhatsappConnected(items.some((account) => account.status === "CONNECTED")))
      .catch(() => setWhatsappConnected(null));
  }, []);

  async function onSubmit(values: z.output<typeof campaignFormSchema>) {
    setSubmitError(null);
    if (whatsappConnected === false && !continueWithoutWhatsApp) {
      setShowConnectionChoice(true);
      return;
    }
    try {
      const campaign = await campaignsApi.create({
        ...values,
        websiteRequirement: values.websiteRequirement ?? "WITHOUT_WEBSITE",
        selectionMode: "AUTO",
        deliveryMode: "AUTO",
      });
      await campaignsApi.update(campaign.id, { status: "READY" });
      await campaignsApi.run(campaign.id);
      router.push(`/campaigns/${campaign.id}${whatsappConnected === false ? "?connect=1" : ""}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === "PAYMENT_REQUIRED") {
        router.push("/pricing");
        return;
      }
      setSubmitError(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  }

  function continueAndCreate(): void {
    setContinueWithoutWhatsApp(true);
    setShowConnectionChoice(false);
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

  return (
    <div className="flex flex-col gap-6">
      {whatsappConnected === false && (
        <Card className="border-dash-primary/30 bg-dash-secondary/30">
          <CardContent className="flex flex-col gap-3 p-5">
            <p className="text-sm font-medium text-dash-foreground">Connect WhatsApp before you start</p>
            <p className="text-sm text-dash-muted-foreground">
              Your campaign can still be created without it. We&apos;ll show the QR code after you submit, and pitches can start once your number is linked.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => router.push("/whatsapp")}>Connect WhatsApp</Button>
              <Button type="button" variant="outline" onClick={() => setContinueWithoutWhatsApp(true)}>Continue without connecting</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showConnectionChoice && (
        <Card className="border-dash-primary/30 bg-dash-secondary/30">
          <CardContent className="flex flex-col gap-3 p-5">
            <p className="text-sm font-medium text-dash-foreground">WhatsApp is not connected</p>
            <p className="text-sm text-dash-muted-foreground">
              Connect now so your pitches can send automatically, or continue entering your campaign details. The QR code will appear after the campaign is created.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => router.push("/whatsapp")}>Connect WhatsApp</Button>
              <Button type="button" variant="outline" onClick={continueAndCreate}>Create campaign anyway</Button>
            </div>
          </CardContent>
        </Card>
      )}

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
            Search fills the form from your sentence. Nothing is scraped until you press Find businesses. After that, leads without a website are selected and WhatsApp messages go out automatically if your number is linked.
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

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="messageTemplate">WhatsApp message</Label>
              <textarea
                id="messageTemplate"
                rows={7}
                className="flex w-full rounded-dash-md border border-dash-input bg-dash-background px-3 py-2 text-sm text-dash-foreground shadow-sm outline-none placeholder:text-dash-muted-foreground focus-visible:ring-2 focus-visible:ring-dash-ring"
                {...register("messageTemplate")}
              />
              <p className="text-xs text-dash-muted-foreground">
                We&apos;ll suggest a message for you. Edit it before starting. Use <code>{"{{business_name}}"}</code> for the lead name and <code>{"{{site_link}}"}</code> for the preview link.
              </p>
              {errors.messageTemplate && <p className="text-xs text-dash-destructive">{errors.messageTemplate.message}</p>}
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
              <Label htmlFor="websiteRequirement">Website</Label>
              <Select id="websiteRequirement" {...register("websiteRequirement")}>
                <option value="WITHOUT_WEBSITE">No website</option>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetCount">How many leads</Label>
              <Input id="targetCount" type="number" min={1} max={MAX_TARGET_COUNT} {...register("targetCount")} />
              {errors.targetCount && <p className="text-xs text-dash-destructive">{errors.targetCount.message}</p>}
              <p className="text-xs text-dash-muted-foreground">
                We search for businesses without a website and with a usable WhatsApp number, up to this many leads.
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

            {submitError && <p className="text-sm text-dash-destructive sm:col-span-2">{submitError}</p>}

            <div className="sm:col-span-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Searching…" : "Find businesses"}
              </Button>
              <p className="mt-2 text-xs text-dash-muted-foreground">
                Link WhatsApp first if you want those pitches sent without another click.{" "}
                <Link href="/whatsapp" className="underline underline-offset-2">
                  Open WhatsApp
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}