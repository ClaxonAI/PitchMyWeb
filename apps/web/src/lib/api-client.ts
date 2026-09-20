// Thin client over the API, which is proxied to this origin by the rewrite
// in next.config.ts. Every call is same-origin, so the session cookie rides
// along without any header handling here.

export type ApiErrorBody = { error: { code: string; message: string } };

/**
 * An API error that kept its machine-readable code. The outreach policy
 * returns its reason as the code (OPTED_OUT, NOT_CONNECTED, ...), which is
 * what lets the UI point at the right control instead of only printing a
 * sentence.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    // Same-origin is the default, but being explicit documents that these
    // calls are cookie-authenticated.
    credentials: "same-origin",
  });

  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // A non-JSON error (a proxy 502, say) still has to become an ApiError.
    }
    throw new ApiError(
      body?.error?.message ?? `Request failed (${response.status})`,
      body?.error?.code ?? "UNKNOWN",
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

// --- Types mirroring the API responses -------------------------------------

export type WaStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "QR_READY"
  | "PAIRING_CODE_READY"
  | "CONNECTED"
  | "RECONNECTING"
  | "LOGGED_OUT"
  | "ERROR";

export type WaMessageStatus =
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "BLOCKED"
  | "CANCELLED";

export type WhatsAppAccount = {
  id: string;
  phoneNumber: string | null;
  displayName: string | null;
  status: WaStatus;
  lastConnectedAt: string | null;
  lastSeenAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppMessage = {
  id: string;
  accountId: string;
  leadId: string | null;
  pitchId: string | null;
  phoneNumber: string;
  body: string;
  status: WaMessageStatus;
  failureReason: string | null;
  queuedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
};

export type PolicyDecision = { allowed: true } | { allowed: false; reason: string; message: string };

export type MessagePreview = {
  phoneNumber: string;
  body: string;
  leadId: string | null;
  pitchId: string | null;
  policy: PolicyDecision;
};

export type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number };

export const whatsappApi = {
  listAccounts: () => api.get<{ items: WhatsAppAccount[] }>("/api/whatsapp/accounts"),
  createAccount: () => api.post<WhatsAppAccount>("/api/whatsapp/accounts", {}),
  connect: (id: string) => api.post<WhatsAppAccount>(`/api/whatsapp/accounts/${id}/connect`, {}),
  pairingCode: (id: string, phoneNumber: string) =>
    api.post<WhatsAppAccount>(`/api/whatsapp/accounts/${id}/pairing-code`, { phoneNumber }),
  disconnect: (id: string) => api.post<WhatsAppAccount>(`/api/whatsapp/accounts/${id}/disconnect`, {}),
  status: (id: string) => api.get<{ accountId: string; status: WaStatus; phoneNumber: string | null; lastSeenAt: string | null; lastError: string | null }>(`/api/whatsapp/accounts/${id}/status`),
  previewMessage: (input: { accountId: string; phoneNumber: string; body?: string; leadId?: string }) =>
    api.post<MessagePreview>("/api/whatsapp/messages/preview", input),
  sendMessage: (input: { accountId: string; phoneNumber: string; body?: string; leadId?: string }) =>
    api.post<WhatsAppMessage>("/api/whatsapp/messages", input),
  listMessages: (accountId?: string) =>
    api.get<Paginated<WhatsAppMessage>>(`/api/whatsapp/messages${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ""}`),
};

export const authApi = {
  login: (email: string, password: string, orderId?: string | null, fingerprintId?: string) =>
    api.post<{ id: string; email: string }>("/api/auth/login", { email, password, ...(orderId ? { orderId } : {}), ...(fingerprintId ? { fingerprintId } : {}) }),
  register: (email: string, password: string, orderId?: string | null, fingerprintId?: string) =>
    api.post<{ id: string; email: string }>("/api/auth/register", { email, password, ...(orderId ? { orderId } : {}), ...(fingerprintId ? { fingerprintId } : {}) }),
  logout: () => api.post<unknown>("/api/auth/logout", {}),
};

// --- Pricing-page checkout (Razorpay Standard Checkout) ---------------------

export type CreateOrderInput = { planId: "auto" | "direct"; market: "india" | "foreign"; countryCode?: string; couponCode?: string | null };
export type CreatedOrder = {
  orderId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  dummy?: boolean;
  status?: "PENDING" | "PAID" | "FAILED";
  claimed?: boolean;
};
export type VerifiedOrder = { orderId: string; status: "PENDING" | "PAID" | "FAILED"; claimed?: boolean };

export const checkoutApi = {
  createOrder: (input: CreateOrderInput) => api.post<CreatedOrder>("/api/checkout/create-order", input),
  verify: (input: { orderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    api.post<VerifiedOrder>("/api/checkout/verify", input),
};

// --- Phase 1 dashboard resources --------------------------------------------

export type Me = {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  planId: string | null;
  hasPaidAccess: boolean;
  allowedMarkets: Array<"india" | "foreign">;
  canDiscover: boolean;
  freePitchesRemaining: number | null;
  freePitchesAllowance: number;
};

export const meApi = {
  get: () => api.get<Me>("/api/me"),
  update: (input: { name: string | null }) => api.patch<Me>("/api/me", input),
  changePassword: (input: { currentPassword: string; newPassword: string }) => api.post<{ success: true }>("/api/me/password", input),
};

export type WebsiteRequirement = "ANY" | "WITH_WEBSITE" | "WITHOUT_WEBSITE";
export type CampaignStatus = "DRAFT" | "READY" | "RUNNING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type SelectionMode = "MANUAL" | "AUTO";
export type DeliveryMode = "AUTO" | "DIRECT";

export type Campaign = {
  id: string;
  name: string;
  location: string;
  radius: number | null;
  category: string;
  minRating: number | null;
  minReviews: number | null;
  websiteRequirement: WebsiteRequirement;
  leadLimit: number;
  status: CampaignStatus;
  selectionMode: SelectionMode;
  targetCount: number;
  deliveryMode: DeliveryMode;
  createdAt: string;
  updatedAt: string;
  market: "india" | "foreign";
};

export type CampaignCreateInput = {
  name: string;
  location: string;
  radius?: number;
  category: string;
  minRating?: number;
  minReviews?: number;
  websiteRequirement?: WebsiteRequirement;
  leadLimit?: number;
  selectionMode?: SelectionMode;
  targetCount?: number;
  deliveryMode?: DeliveryMode;
  market?: "india" | "foreign";
};

export type PipelineStage = "SELECTED" | "BUILDING_SITE" | "SITE_PUBLISHED" | "RECORDING" | "VIDEO_UPLOADED" | "DELIVERY_QUEUED" | "LINK_READY" | "SENT" | "FAILED";

export type CampaignOverview = {
  campaign: Campaign;
  execution: {
    id: string;
    status: "RUNNING" | "COMPLETED" | "FAILED";
    provider: string;
    businessesFound: number;
    leadsCreated: number;
    failedCount: number;
    errorMessage: string | null;
    startedAt: string;
    triggeredAt: string | null;
    completedAt: string | null;
  } | null;
  counts: {
    leads: number;
    selected: number;
    stages: Record<PipelineStage, number>;
    delivered: number;
  };
  whatsapp: { id: string; status: string; phoneNumber: string | null } | null;
};

export type WebsiteVerificationStatus = "UNVERIFIED" | "LIVE" | "PARKED" | "DEAD" | "UNREACHABLE";
export type DiscoveryStage = "QUEUED" | "GEOCODING" | "SEARCHING" | "ENRICHING" | "COMPLETED" | "FAILED";

export type Business = {
  id: string;
  name: string;
  category: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  rating: number | null;
  reviewCount: number | null;
  source: string;
  externalId: string | null;
  websiteVerificationStatus: WebsiteVerificationStatus;
  websiteVerifiedAt: string | null;
};

export type CampaignLeadRow = {
  lead: { id: string; status: string; score: number | null; recommendedService: string | null } | null;
  business: Business;
  pipeline: { id: string; stage: PipelineStage; videoReady?: boolean } | null;
};

export const campaignsApi = {
  list: (query: { page?: number; pageSize?: number; status?: CampaignStatus } = {}) => api.get<Paginated<Campaign>>(`/api/campaigns${toQueryString(query)}`),
  create: (input: CampaignCreateInput) => api.post<Campaign>("/api/campaigns", input),
  get: (id: string) => api.get<Campaign>(`/api/campaigns/${id}`),
  update: (id: string, input: Partial<CampaignCreateInput> & { status?: "READY" }) => api.patch<Campaign>(`/api/campaigns/${id}`, input),
  run: (id: string) => api.post<{ campaign: Campaign; execution: unknown }>(`/api/campaigns/${id}/run`, {}),
  parseQuery: (query: string) =>
    api.post<{ parsed: Partial<CampaignCreateInput> | null; reason?: "not_configured" | "parse_failed" }>("/api/campaigns/parse-query", { query }),
  pauseSending: (id: string) => api.post<unknown>(`/api/campaigns/${id}/pause-sending`, {}),
  overview: (id: string) => api.get<CampaignOverview>(`/api/campaigns/${id}/overview`),
  leads: (id: string, query: { sort?: "score" | "recent"; search?: string } = {}) =>
    api.get<{ items: CampaignLeadRow[]; total: number; selectedCount: number; targetCount: number }>(`/api/campaigns/${id}/leads${toQueryString(query)}`),
};

export type LeadStatus = "NEW" | "ANALYZED" | "SITE_READY" | "PITCHED" | "REPLIED" | "INTERESTED" | "NEGOTIATING" | "WON" | "LOST";
export type ServiceCode = "WEBSITE" | "WEBSITE_REDESIGN" | "WHATSAPP" | "REVIEWS" | "SEO" | "AI_CHATBOT" | "AI_VOICE_AGENT" | "APPOINTMENT_SYSTEM" | "DIGITAL_MENU" | "POS";

export type Lead = {
  id: string;
  campaignId: string;
  businessId: string;
  status: LeadStatus;
  score: number | null;
  recommendedService: ServiceCode | null;
  estimatedDealMin: number | null;
  estimatedDealMax: number | null;
  summary: string | null;
  services: string[];
  createdAt: string;
  updatedAt: string;
  business: Business;
};

export type LeadScore = {
  id: string;
  rating: number;
  reviewVolume: number;
  websiteGap: number;
  socialPresence: number;
  contactAvailability: number;
  businessValue: number;
  localDemand: number;
  dataQuality: number;
  total: number;
  classification: "EXCELLENT" | "STRONG" | "MEDIUM" | "LOW" | "IGNORE";
  createdAt: string;
};

export type LeadAnalysis = {
  id: string;
  status: "SUCCESS" | "FAILED";
  summary: string | null;
  websiteNeed: number | null;
  whatsappNeed: number | null;
  reviewAutomationNeed: number | null;
  voiceAgentNeed: number | null;
  recommendedService: ServiceCode | null;
  errorMessage: string | null;
  createdAt: string;
};

export type ActivityRow = { id: string; leadId: string; type: string; metadata: unknown; createdAt: string; lead?: { business: Business; campaign: { id: string; name: string } } };

export type Pitch = { id: string; leadId: string; content: string; promptVersion: string; modelName: string; status: "PENDING" | "GENERATED" | "FAILED"; createdAt: string };

export type Outreach = { id: string; leadId: string; pitchId: string | null; channel: string; status: string; whatsappUrl: string | null; openedAt: string | null; sentAt: string | null };

export type Deal = { id: string; leadId: string; value: number; status: "OPEN" | "NEGOTIATING" | "WON" | "LOST" };

export type WebsiteProject = {
  id: string;
  leadId: string;
  template: string;
  theme: string | null;
  contentJSON: Record<string, unknown>;
  designJSON: Record<string, unknown> | null;
  slug: string;
  demoUrl: string | null;
  publishedUrl: string | null;
  status: "DRAFT" | "GENERATING" | "READY" | "PUBLISHED" | "FAILED";
  createdAt: string;
  updatedAt: string;
};

export type LeadDetail = Lead & {
  campaign: Campaign;
  scores: LeadScore[];
  analyses: LeadAnalysis[];
  activities: ActivityRow[];
  websiteProjects: WebsiteProject[];
  pitches: Pitch[];
  outreach: Outreach[];
  deal: Deal | null;
};

export const leadsApi = {
  list: (query: { page?: number; pageSize?: number; campaignId?: string; status?: LeadStatus; minScore?: number; maxScore?: number; recommendedService?: ServiceCode; search?: string } = {}) =>
    api.get<Paginated<Lead>>(`/api/leads${toQueryString(query)}`),
  get: (id: string) => api.get<LeadDetail>(`/api/leads/${id}`),
  updateStatus: (id: string, status: LeadStatus) => api.patch<LeadDetail>(`/api/leads/${id}`, { status }),
  analyze: (id: string) => api.post<LeadDetail>(`/api/leads/${id}/analyze`, {}),
  pitch: (id: string) => api.post<LeadDetail>(`/api/leads/${id}/pitch`, {}),
  whatsapp: (id: string) => api.post<{ id: string; whatsappUrl: string | null }>(`/api/leads/${id}/whatsapp`, {}),
};

export const websitesApi = {
  list: (query: { page?: number; pageSize?: number; leadId?: string; status?: string } = {}) => api.get<Paginated<WebsiteProject>>(`/api/websites${toQueryString(query)}`),
  get: (id: string) => api.get<WebsiteProject & { versions: Array<{ id: string; versionNumber: number; createdAt: string }> }>(`/api/websites/${id}`),
  publish: (id: string) => api.post<WebsiteProject>(`/api/websites/${id}/publish`, {}),
};

export const activitiesApi = {
  list: (query: { page?: number; pageSize?: number; campaignId?: string; leadId?: string } = {}) => api.get<Paginated<ActivityRow>>(`/api/activities${toQueryString(query)}`),
};

export const pitchesApi = {
  list: (query: { page?: number; pageSize?: number; campaignId?: string; leadId?: string; status?: string } = {}) =>
    api.get<Paginated<Pitch & { lead: Lead }>>(`/api/pitches${toQueryString(query)}`),
};

export type AnalyticsSummary = {
  totalBusinesses: number;
  qualifiedLeads: number;
  demosGenerated: number;
  pitches: number;
  replies: number;
  interested: number;
  won: number;
  pipelineValue: number;
  funnel: { found: number; qualified: number; analyzed: number; demo: number; pitched: number; replied: number; interested: number; won: number };
  breakdown: {
    byCampaign: Array<{ campaignId: string; campaignName: string; leadCount: number }>;
    byRecommendedService: Array<{ recommendedService: string | null; leadCount: number }>;
    byCategory: Array<{ category: string; businessCount: number }>;
  };
};

export const analyticsApi = {
  get: () => api.get<AnalyticsSummary>("/api/analytics"),
};

function toQueryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
