import type { PrismaClient, WhatsAppMessage } from "@pitchmyweb/db";
import type { PolicyDecision, PolicyReason } from "@pitchmyweb/contracts";
import { ConflictError, DomainError, NotFoundError, ValidationError } from "../errors";
import { normalizePhoneForWhatsApp } from "../leads/whatsapp.service";
import { evaluate } from "./outreach-policy";
import { enqueueSend } from "./queue";
import type { MessageCreateInput, MessageListQuery, MessagePreviewInput } from "../validation/whatsapp";

// Composing and queueing outbound messages.
//
// The API never sends anything: it writes a QUEUED row and enqueues a job
// carrying only that row's id. The body therefore exists in exactly one
// place (Postgres) and never sits in Redis, which matters because message
// bodies are the user's own outreach copy addressed to a real business.

/**
 * A policy denial at enqueue time.
 *
 * The reason becomes the error *code* (`OPTED_OUT`, `NOT_CONNECTED`, ...)
 * rather than an extra field, because the shared {error:{code,message}}
 * envelope in lib/api/response.ts carries exactly those two things. That
 * keeps the denial machine-readable for the UI — which control to
 * highlight — without teaching the error mapper a new response shape.
 */
export class OutreachBlockedError extends DomainError {
  constructor(
    message: string,
    public readonly reason: PolicyReason,
  ) {
    super(message, reason.toUpperCase(), 409);
    this.name = "OutreachBlockedError";
  }
}

export type PublicMessage = Pick<
  WhatsAppMessage,
  | "id"
  | "accountId"
  | "leadId"
  | "pitchId"
  | "phoneNumber"
  | "body"
  | "mediaKind"
  | "status"
  | "failureReason"
  | "queuedAt"
  | "sentAt"
  | "deliveredAt"
  | "readAt"
  | "createdAt"
>;

const PUBLIC_FIELDS = {
  id: true,
  accountId: true,
  leadId: true,
  pitchId: true,
  phoneNumber: true,
  body: true,
  // The attachment kind is shown in the dashboard. Its storage key is an
  // internal bucket path and, like providerMessageId, stays server-side.
  mediaKind: true,
  status: true,
  failureReason: true,
  queuedAt: true,
  sentAt: true,
  deliveredAt: true,
  readAt: true,
  createdAt: true,
  // providerMessageId is deliberately absent: it is WhatsApp's internal
  // identifier, useful only to the worker matching receipts.
} as const;

type ResolvedDraft = {
  phoneNumber: string;
  body: string;
  leadId: string | null;
  pitchId: string | null;
};

/**
 * Turns a request into the exact text that would be sent, resolving a
 * leadId into that lead's most recent generated pitch — the same rule
 * lib/leads/whatsapp.service.ts applies when building a wa.me link, so a
 * pitch sent automatically and a pitch sent by hand are the same text.
 */
async function resolveDraft(db: PrismaClient, userId: string, input: MessagePreviewInput): Promise<ResolvedDraft> {
  const phoneNumber = normalizePhoneForWhatsApp(input.phoneNumber);
  if (!phoneNumber) {
    throw new ValidationError("Enter a valid phone number, including the country code");
  }

  if (!input.leadId) {
    // The schema guarantees one of body/leadId is present.
    return { phoneNumber, body: input.body!, leadId: null, pitchId: null };
  }

  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    include: {
      campaign: { select: { userId: true } },
      pitches: { where: { status: "GENERATED" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  // Ownership runs through Lead -> Campaign -> User, the same path every
  // other lead-scoped service uses.
  if (!lead || lead.campaign.userId !== userId) {
    throw new NotFoundError("Lead", input.leadId);
  }

  // An explicit body wins over the pitch: the user may have edited it.
  if (input.body) {
    return { phoneNumber, body: input.body, leadId: lead.id, pitchId: lead.pitches[0]?.id ?? null };
  }

  const pitch = lead.pitches[0];
  if (!pitch) {
    throw new ConflictError("Generate a pitch for this lead before sending a WhatsApp message");
  }
  return { phoneNumber, body: pitch.content, leadId: lead.id, pitchId: pitch.id };
}

export type MessagePreview = ResolvedDraft & { policy: PolicyDecision };

/** Dry run: what would be sent, and whether the policy would allow it. */
export async function previewMessage(db: PrismaClient, userId: string, input: MessagePreviewInput): Promise<MessagePreview> {
  const draft = await resolveDraft(db, userId, input);
  const policy = await evaluate(db, {
    userId,
    accountId: input.accountId,
    phoneNumber: draft.phoneNumber,
    leadId: draft.leadId,
  });
  return { ...draft, policy };
}

/**
 * Creates the QUEUED row and enqueues the send. A policy denial is a 409
 * rather than a BLOCKED row: nothing was queued, so there is nothing to
 * record — the user is told why and can act on it.
 */
export type MessageMedia = {
  kind: "VIDEO";
  storageKey: string;
  mimeType: string;
};

export type EnqueueMessageOptions = {
  /** Attach a stored file; the body becomes its caption. Server-side callers only. */
  media?: MessageMedia;
  /**
   * A second file sent right after the first, in the same send (the laptop
   * walkthrough after the phone one). One message row, one policy check, one
   * rate-limit slot: sending it as its own message would be refused as a
   * recent duplicate to the same number.
   */
  secondaryMedia?: MessageMedia & { caption: string };
};

export async function enqueueMessage(
  db: PrismaClient,
  userId: string,
  input: MessageCreateInput,
  options: EnqueueMessageOptions = {},
): Promise<PublicMessage> {
  const draft = await resolveDraft(db, userId, input);

  const account = await db.whatsAppAccount.findFirst({
    where: { id: input.accountId, userId },
    select: { id: true },
  });
  if (!account) throw new NotFoundError("WhatsApp account", input.accountId);

  const policy = await evaluate(db, {
    userId,
    accountId: input.accountId,
    phoneNumber: draft.phoneNumber,
    leadId: draft.leadId,
  });
  if (!policy.allowed) {
    throw new OutreachBlockedError(policy.message, policy.reason);
  }

  const message = await db.whatsAppMessage.create({
    data: {
      userId,
      accountId: input.accountId,
      leadId: draft.leadId,
      pitchId: draft.pitchId,
      phoneNumber: draft.phoneNumber,
      body: draft.body,
      ...(options.media
        ? { mediaKind: options.media.kind, mediaStorageKey: options.media.storageKey, mediaMimeType: options.media.mimeType }
        : {}),
      ...(options.media && options.secondaryMedia
        ? {
            secondaryMediaStorageKey: options.secondaryMedia.storageKey,
            secondaryMediaMimeType: options.secondaryMedia.mimeType,
            secondaryCaption: options.secondaryMedia.caption,
          }
        : {}),
      status: "QUEUED",
    },
    select: PUBLIC_FIELDS,
  });

  // Enqueued after the row exists, so the worker can never receive a job
  // for a message it cannot read.
  await enqueueSend({ messageId: message.id });
  return message;
}

export async function listMessages(
  db: PrismaClient,
  userId: string,
  query: MessageListQuery,
): Promise<{ items: PublicMessage[]; page: number; pageSize: number; total: number }> {
  const where = {
    userId,
    ...(query.accountId ? { accountId: query.accountId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const [items, total] = await Promise.all([
    db.whatsAppMessage.findMany({
      where,
      select: PUBLIC_FIELDS,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    db.whatsAppMessage.count({ where }),
  ]);
  return { items, page: query.page, pageSize: query.pageSize, total };
}

export async function getMessage(db: PrismaClient, userId: string, messageId: string): Promise<PublicMessage> {
  const message = await db.whatsAppMessage.findFirst({
    where: { id: messageId, userId },
    select: PUBLIC_FIELDS,
  });
  if (!message) throw new NotFoundError("WhatsApp message", messageId);
  return message;
}
