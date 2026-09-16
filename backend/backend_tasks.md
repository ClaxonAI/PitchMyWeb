# Sarrvai Goldmine --- Backend & Database Task README

> **Purpose:** This README is the implementation guide for Claude Code
> while building the **Backend + PostgreSQL/Prisma layer only** for
> Sarrvai Goldmine.
>
> **Primary source:** Sarrvai Goldmine Detailed Technical & Product
> Documentation, Version 1.0.
>
> **Important scope boundary:** Do **not** implement the frontend or n8n
> workflows as part of this task. Build the backend APIs, business
> logic, validation, persistence, scoring, domain services, webhook
> contracts, and database needed by those layers.

------------------------------------------------------------------------

## 1. Role and Responsibility

The backend is the controlled business layer.

### Backend owns

-   REST/API endpoints
-   Authentication and authorization
-   Request validation
-   Domain/business rules
-   Deterministic opportunity scoring
-   Service recommendation rules
-   Database persistence
-   State transitions
-   Activity/event recording
-   Idempotency and duplicate prevention
-   API contracts consumed by frontend and n8n
-   AI request/response validation
-   Website/pitch persistence
-   Configuration and pricing
-   Error handling and retry-safe operations

### Backend must NOT own

-   Frontend UI
-   Dashboard rendering
-   Long-running workflow orchestration
-   n8n workflow logic
-   Arbitrary website generation by the LLM
-   Browser automation / Playwright worker implementation
-   Direct uncontrolled Google Maps scraping

Architecture rule:

``` text
NEXT.JS     = PRODUCT
BACKEND     = BUSINESS LOGIC
POSTGRESQL  = MEMORY / SOURCE OF TRUTH
N8N         = AUTOMATION
OLLAMA      = INTELLIGENCE
PLAYWRIGHT  = BROWSER AUTOMATION
TEMPLATES   = WEBSITE FACTORY
PROVIDER    = LEAD SUPPLY
```

The backend must remain the authority for business state and database
writes.

------------------------------------------------------------------------

# 2. Target Stack

Use the stack specified by the project documentation unless the existing
repository already establishes an equivalent implementation:

-   Next.js API routes / route handlers
-   TypeScript
-   PostgreSQL
-   Prisma ORM
-   Zod validation
-   Existing authentication/session mechanism if already present
-   Ollama client/service for AI calls
-   REST APIs
-   Webhook endpoints for n8n

Do not introduce unnecessary infrastructure during the one-day sprint.

------------------------------------------------------------------------

# 3. Repository Areas

Expected backend-oriented structure:

``` text
apps/
└── web/
    ├── app/
    │   └── api/
    │       ├── auth/
    │       ├── campaigns/
    │       ├── leads/
    │       ├── businesses/
    │       ├── websites/
    │       ├── outreach/
    │       ├── pipeline/
    │       ├── analytics/
    │       ├── settings/
    │       └── webhooks/
    │           └── n8n/
    │
    └── lib/
        ├── auth/
        ├── db/
        ├── validation/
        ├── scoring/
        ├── services/
        ├── website/
        ├── outreach/
        └── n8n/

prisma/
├── schema.prisma
├── migrations/
└── seed.ts

packages/
├── database/
├── ai/
├── lead-engine/
└── shared/
```

If the existing repository differs, preserve the existing architecture
where sensible rather than restructuring everything.

------------------------------------------------------------------------

# 4. Database Is the Source of Truth

PostgreSQL is the authoritative source for:

-   Users
-   Campaigns
-   Businesses
-   Leads
-   Lead scores
-   Website projects
-   Website versions
-   Pitches
-   Outreach
-   Activities
-   Deals
-   Services/pricing
-   Settings

n8n must not become the source of truth.

n8n should call backend APIs to perform controlled state changes.

------------------------------------------------------------------------

# 5. Core Database Models

Implement the following domain entities.

## 5.1 User

Purpose:

-   Authentication
-   Ownership of campaigns and user-specific data

At minimum:

``` text
id
email
passwordHash
createdAt
updatedAt
```

Requirements:

-   Never store plaintext passwords.
-   Email must be unique.
-   Use a modern password hashing library.
-   Use secure sessions / HTTP-only cookies if authentication is
    implemented in this sprint.

------------------------------------------------------------------------

## 5.2 Campaign

Purpose:

Lead-generation configuration and execution state.

Fields:

``` text
id
userId
name
location
radius
category
minRating
minReviews
websiteRequirement
leadLimit
status
createdAt
updatedAt
```

Campaign status:

``` text
DRAFT
READY
RUNNING
PROCESSING
COMPLETED
FAILED
```

Relationships:

``` text
User 1 ─── N Campaign
Campaign 1 ─── N Lead
```

Validation:

-   name required
-   location required
-   radius must be positive when provided
-   minRating must be within a valid rating range
-   minReviews \>= 0
-   leadLimit \> 0
-   websiteRequirement must be an allowed enum
-   status transitions must be controlled by backend rules

------------------------------------------------------------------------

# 6. Business Model

Purpose:

Canonical business record.

Fields specified by the documentation:

``` text
id
name
category
address
city
phone
email
website
instagram
facebook
rating
reviewCount
latitude
longitude
source
externalId
createdAt
updatedAt
```

Important distinction:

**Business = canonical business identity.**

**Lead = business participating in a specific campaign/sales process.**

Do not duplicate the canonical business record unnecessarily.

## Deduplication

Use a database uniqueness strategy to prevent duplicate canonical
businesses.

Primary discovery deduplication rule from the documentation:

``` text
source + externalId
```

If the provider supplies an external ID, use it with the source as the
canonical discovery identity.

Do not rely only on application-level duplicate checks. Add database
constraints where appropriate.

------------------------------------------------------------------------

# 7. Lead Model

Purpose:

Represents a Business inside a Campaign and tracks its sales lifecycle.

Fields:

``` text
id
campaignId
businessId
status
score
recommendedService
estimatedDealMin
estimatedDealMax
createdAt
updatedAt
```

Relationships:

``` text
Campaign 1 ─── N Lead
Business 1 ─── N Lead
Lead 1 ─── N LeadScore
Lead 1 ─── N WebsiteProject
Lead 1 ─── N Pitch
Lead 1 ─── N Outreach
Lead 1 ─── N Activity
Lead 1 ─── 0..1 Deal
```

------------------------------------------------------------------------

# 8. Lead Lifecycle

Implement these statuses exactly:

``` text
NEW
↓
ANALYZED
↓
SITE_READY
↓
PITCHED
↓
REPLIED
↓
INTERESTED
↓
NEGOTIATING
↓
WON
```

Any active stage can transition to:

``` text
LOST
```

## State transition rules

Do not allow arbitrary status mutation from an API request.

Create a domain service such as:

``` text
transitionLeadStatus(leadId, nextStatus)
```

It must:

1.  Load current status.
2.  Check whether the transition is legal.
3.  Update the lead.
4.  Create the appropriate Activity event.
5.  Execute the update transactionally where possible.

Example:

``` text
NEW -> ANALYZED       allowed
ANALYZED -> SITE_READY allowed
SITE_READY -> PITCHED  allowed
PITCHED -> REPLIED     allowed
REPLIED -> INTERESTED  allowed
INTERESTED -> NEGOTIATING allowed
NEGOTIATING -> WON     allowed

NEW -> WON             reject
NEW -> PITCHED         reject
WON -> NEW             reject
```

Allow `LOST` from active stages according to the product specification.

------------------------------------------------------------------------

# 9. LeadScore Model

Purpose:

Store deterministic opportunity scoring.

Scoring signals:

  Signal                    Points
  ---------------------- ---------
  Rating                        15
  Review volume                 15
  Website gap                   25
  Social presence               10
  Contact availability          10
  Business value                10
  Local demand                  10
  Data quality                   5
  **Total**                **100**

The final score must be deterministic and reproducible.

Classification:

``` text
90–100 = Excellent
75–89  = Strong
60–74  = Medium
40–59  = Low
0–39   = Ignore
```

## Critical rule

Ollama must **not** be the authority for the deterministic score.

The backend calculates the score.

Ollama can explain/refine recommendations after deterministic signals
have been calculated.

Create a dedicated scoring module:

``` text
lib/scoring/
```

Suggested interface:

``` ts
type OpportunitySignals = {
  rating: number;
  reviewVolume: number;
  websiteGap: number;
  socialPresence: number;
  contactAvailability: number;
  businessValue: number;
  localDemand: number;
  dataQuality: number;
};

type OpportunityScore = {
  total: number;
  classification: "EXCELLENT" | "STRONG" | "MEDIUM" | "LOW" | "IGNORE";
  breakdown: OpportunitySignals;
};
```

Keep scoring logic independently testable.

------------------------------------------------------------------------

# 10. Service Recommendation

Allowed services:

``` text
WEBSITE
WEBSITE_REDESIGN
WHATSAPP
REVIEWS
SEO
AI_CHATBOT
AI_VOICE_AGENT
APPOINTMENT_SYSTEM
DIGITAL_MENU
POS
```

Recommendation logic must combine deterministic signals with
configurable rules.

Do not make Ollama the only authority.

Recommended architecture:

``` text
Lead
  ↓
Inspection / normalized data
  ↓
Deterministic signals
  ↓
Opportunity score
  ↓
Rule-based recommendation
  ↓
Optional Ollama explanation/refinement
  ↓
Persist final recommendation
```

Keep service recommendation rules in a dedicated service rather than
inside API route handlers.

------------------------------------------------------------------------

# 11. Pricing Configuration

The documentation gives these example ranges:

  Offer                  Example range
  -------------------- ---------------
  Website                   ₹15k--₹25k
  Website + WhatsApp        ₹20k--₹30k
  Website + AI Voice        ₹30k--₹50k
  Complete package          ₹40k--₹75k

These are examples, not values to hardcode throughout the application.

Store pricing in Service / Settings configuration.

The backend should expose service configuration through the settings
API.

------------------------------------------------------------------------

# 12. WebsiteProject Model

Purpose:

Represents the generated personalized demo.

Fields:

``` text
id
leadId
template
theme
contentJSON
designJSON
demoUrl
publishedUrl
status
createdAt
updatedAt
```

Website lifecycle/status should be explicit and validated.

A WebsiteProject belongs to a Lead.

------------------------------------------------------------------------

# 13. WebsiteVersion Model

Purpose:

Preserve regeneration history.

Every website regeneration should create a version rather than
destroying previous content.

Conceptually:

``` text
WebsiteProject
    ├── Version 1
    ├── Version 2
    ├── Version 3
    └── ...
```

The backend should preserve historical content for reproducibility.

------------------------------------------------------------------------

# 14. Pitch Model

Purpose:

Store generated outreach copy.

Minimum useful fields:

``` text
id
leadId
content
promptVersion
modelName
status
createdAt
updatedAt
```

The exact schema can be adapted to the existing project structure, but
generated pitches must be persisted and reproducible.

------------------------------------------------------------------------

# 15. Outreach Model

Purpose:

Track outreach channel and state.

V1 behavior:

``` text
Generate pitch
    ↓
Generate WhatsApp-ready URL
    ↓
Show to operator
    ↓
Human manually approves/sends
    ↓
Backend marks lead as PITCHED
```

Do **not** build bulk personal-WhatsApp automation.

The documentation explicitly requires human-in-the-loop outreach for V1.

------------------------------------------------------------------------

# 16. Activity Model

Purpose:

CRM event timeline.

Activity events:

``` text
LEAD_CREATED
LEAD_ANALYZED
WEBSITE_GENERATED
DEMO_PUBLISHED
PITCH_GENERATED
WHATSAPP_OPENED
PITCHED
REPLIED
INTERESTED
MEETING
WON
LOST
```

Activities should be treated as immutable-ish historical events.

Do not silently overwrite or delete historical CRM events.

Create a reusable function:

``` ts
recordActivity({
  leadId,
  type,
  metadata
})
```

Whenever an important state-changing action occurs, record the
corresponding Activity.

------------------------------------------------------------------------

# 17. Deal Model

Purpose:

Negotiation, value and won/lost state.

Support at minimum:

``` text
leadId
value
status
createdAt
updatedAt
```

The exact status model may be extended if the repository already has
one.

The deal should be associated with the lead rather than becoming a
second source of truth for lead lifecycle.

------------------------------------------------------------------------

# 18. Service Model

Purpose:

Configurable services and pricing.

Suggested fields:

``` text
id
name
code
description
priceMin
priceMax
active
createdAt
updatedAt
```

`code` should use the allowed service identifiers.

Example:

``` text
WEBSITE
WEBSITE_REDESIGN
AI_VOICE_AGENT
```

------------------------------------------------------------------------

# 19. Settings Model

Purpose:

User/system configuration.

Potential configuration:

``` text
pricing
follow-up delay
default campaign settings
AI model configuration
other operator settings
```

Do not put secrets into ordinary settings records.

Secrets belong in environment variables/secrets.

------------------------------------------------------------------------

# 20. Prisma Schema Requirements

Before writing application logic:

1.  Inspect the existing repository.
2.  Check whether Prisma already exists.
3.  Check the current PostgreSQL configuration.
4.  Avoid destroying existing schema/data.
5.  Add migrations incrementally.
6.  Add appropriate indexes.
7.  Add unique constraints for deduplication.
8.  Define foreign-key relationships.
9.  Define enums for controlled states.
10. Run Prisma validation/generation after schema changes.

Useful commands, depending on repository scripts:

``` bash
npx prisma validate
npx prisma generate
npx prisma migrate dev
```

Do not reset the database unless explicitly instructed.

------------------------------------------------------------------------

# 21. Seed Data

V1 must use a seeded/demo provider so the complete backend can be tested
without external API keys.

Create realistic demo businesses covering multiple cases:

-   business with no website
-   business with an existing website
-   business with strong reviews
-   business with weak digital presence
-   business with social presence
-   business with missing contact information

Seed enough data to test:

-   campaign filtering
-   deduplication
-   scoring
-   recommendation
-   lead lifecycle
-   website generation
-   pitch generation
-   analytics

Do not invent factual claims about real businesses in generated content.
Prefer clearly fictional/demo businesses in seed data.

------------------------------------------------------------------------

# 22. Lead Provider Abstraction

Implement the provider abstraction from the specification:

``` ts
interface LeadProvider {
  search(input: CampaignSearch): Promise<Business[]>;
}
```

Providers:

``` text
DemoProvider
BusinessAPIProvider
FutureProvider
```

V1:

``` text
DemoProvider
```

The backend should not be tightly coupled to one external business-data
provider.

Later providers should implement the same interface.

------------------------------------------------------------------------

# 23. Campaign APIs

Required endpoints from the product documentation:

``` http
GET    /api/campaigns
POST   /api/campaigns
GET    /api/campaigns/:id
PATCH  /api/campaigns/:id
POST   /api/campaigns/:id/run
```

### POST /api/campaigns

Responsibilities:

-   authenticate user
-   validate body with Zod
-   create campaign
-   set initial status appropriately
-   return normalized campaign

### PATCH /api/campaigns/:id

Responsibilities:

-   authenticate user
-   authorize campaign ownership
-   validate update
-   prevent invalid changes while campaign is running where necessary

### POST /api/campaigns/:id/run

Responsibilities:

-   authenticate
-   authorize
-   validate campaign state
-   prevent duplicate concurrent runs
-   transition campaign to appropriate running state
-   create an idempotent execution/job request
-   trigger orchestration through the expected n8n integration contract

The backend should not perform the entire long-running workflow
synchronously.

------------------------------------------------------------------------

# 24. Lead APIs

Required endpoints:

``` http
GET   /api/leads
GET   /api/leads/:id
PATCH /api/leads/:id
POST  /api/leads/:id/analyze
POST  /api/leads/:id/demo
POST  /api/leads/:id/pitch
POST  /api/leads/:id/whatsapp
```

## GET /api/leads

Support useful filtering:

-   campaign
-   status
-   score range
-   recommended service
-   search
-   pagination

Never return data belonging to another user.

## GET /api/leads/:id

Return enough information for the lead detail page:

-   business profile
-   contact details
-   inspection results
-   score breakdown
-   AI analysis
-   recommendation
-   estimated deal
-   website/demo status
-   pitch
-   outreach
-   CRM status
-   activity timeline

------------------------------------------------------------------------

# 25. PATCH Lead Status

Do not allow:

``` http
PATCH /api/leads/:id
{
  "status": "WON"
}
```

to bypass lifecycle validation.

Route handlers must call a domain service that validates transitions.

Example:

``` ts
await transitionLeadStatus({
  leadId,
  nextStatus: "PITCHED",
  actorId
});
```

The transition should also create Activity.

------------------------------------------------------------------------

# 26. Analyze Lead

Endpoint:

``` http
POST /api/leads/:id/analyze
```

Backend flow:

``` text
Load lead
↓
Load business
↓
Load inspection/enrichment data
↓
Calculate deterministic score
↓
Build structured AI input
↓
Call Ollama
↓
Validate AI response with Zod
↓
Retry once if invalid
↓
Persist analysis/recommendation/deal estimate
↓
Record LEAD_ANALYZED
↓
Update lead status to ANALYZED
```

AI must not invent factual business information.

------------------------------------------------------------------------

# 27. Ollama Contract

Expected structured response includes fields such as:

``` json
{
  "summary": "Established clinic with strong reviews and no website.",
  "websiteNeed": 94,
  "whatsappNeed": 72,
  "reviewAutomationNeed": 61,
  "voiceAgentNeed": 84,
  "recommendedService": "WEBSITE",
  "estimatedDealMin": 15000,
  "estimatedDealMax": 30000
}
```

Use Zod validation after every Ollama response.

### Invalid JSON behavior

``` text
Ollama response
    ↓
Zod validation
    ↓
valid → persist
invalid
    ↓
repair prompt
    ↓
validate again
    ↓
valid → persist
invalid → mark job failed + manual retry available
```

Retry exactly once for malformed structured output unless a more
specific existing retry policy exists.

------------------------------------------------------------------------

# 28. AI Safety / Factuality Rules

AI prompts must explicitly enforce:

-   Never invent phone numbers.
-   Never invent reviews.
-   Never invent addresses.
-   Never invent awards.
-   Never invent customer claims.
-   Use only facts present in the lead record or explicitly supplied by
    the operator.
-   Return structured JSON for machine-consumed outputs.
-   Keep prompt versions.
-   Record model name.
-   Record prompt version.
-   Record latency.
-   Record output status.

The backend should treat AI output as untrusted input.

------------------------------------------------------------------------

# 29. Website APIs

Required endpoints:

``` http
GET   /api/websites
GET   /api/websites/:id
POST  /api/websites
PATCH /api/websites/:id
POST  /api/websites/:id/publish
```

Backend responsibilities:

-   validate website content
-   validate editable fields
-   prevent arbitrary unsafe content from entering rendering
-   persist WebsiteProject
-   create WebsiteVersion on regeneration
-   generate/validate unique slug where applicable
-   maintain relationship to Lead

The backend should never let Ollama define arbitrary HTML/CSS
architecture.

The website factory uses fixed templates and controlled editable fields.

------------------------------------------------------------------------

# 30. Template Contract

Backend should work with a constrained template contract such as:

``` json
{
  "template": "clinic-modern",
  "businessName": "Lakshmi Dental Care",
  "theme": "clean",
  "hero": {
    "headline": "Trusted Dental Care for Your Family",
    "subheadline": "Modern dental care in Chennai.",
    "cta": "Book Appointment"
  },
  "services": [
    "Dental Implants",
    "Teeth Cleaning",
    "Orthodontics"
  ],
  "contact": {
    "phone": "+91...",
    "address": "Chennai"
  }
}
```

The backend should validate the content against the selected template's
allowed fields.

------------------------------------------------------------------------

# 31. Pitch API

Endpoint:

``` http
POST /api/leads/:id/pitch
```

Flow:

``` text
Load lead
↓
Load business
↓
Load demo
↓
Load recommendation/offer
↓
Build pitch context
↓
Call Ollama
↓
Validate output
↓
Persist Pitch
↓
Record PITCH_GENERATED
```

Pitch generation must use only verified lead/business information.

------------------------------------------------------------------------

# 32. WhatsApp API

Endpoint:

``` http
POST /api/leads/:id/whatsapp
```

V1 requirement:

-   Generate a WhatsApp-ready action/link.
-   Do not automatically send the message.
-   Operator manually reviews and sends.
-   Record `WHATSAPP_OPENED` when the action is triggered, if the
    application can reliably observe that action.
-   Mark lead `PITCHED` only when the operator explicitly confirms that
    the pitch was sent.

Production messaging should use an official WhatsApp Business/API
channel rather than bulk automation through personal accounts.

------------------------------------------------------------------------

# 33. Business APIs

The documentation lists a businesses API area even though the frontend
endpoint list is focused on campaigns/leads.

Implement business endpoints only if needed by the existing frontend or
internal workflow.

Possible responsibilities:

``` text
GET /api/businesses
GET /api/businesses/:id
```

Keep canonical business records separate from campaign-specific lead
state.

------------------------------------------------------------------------

# 34. Analytics API

Required endpoint:

``` http
GET /api/analytics
```

It should derive metrics from PostgreSQL rather than maintaining fragile
duplicated counters.

Metrics required by the product:

-   total businesses
-   qualified leads
-   demos generated
-   pitches
-   replies
-   interested
-   won
-   pipeline value

Funnel:

``` text
found
→ qualified
→ analyzed
→ demo
→ pitched
→ replied
→ interested
→ won
```

Where possible, calculate analytics using indexed database queries.

------------------------------------------------------------------------

# 35. Settings API

Required:

``` http
GET /api/settings
```

Add update endpoints only if required by the frontend.

Settings should expose configurable service/pricing information without
exposing secrets.

------------------------------------------------------------------------

# 36. n8n Webhook Contract

Backend must expose authenticated webhook endpoints for n8n.

Example area:

``` text
/api/webhooks/n8n/
```

Requirements:

-   Authenticate webhook calls with a shared secret/signature.
-   Validate request bodies with Zod.
-   Never trust n8n payloads blindly.
-   Verify referenced records exist.
-   Enforce valid state transitions.
-   Make webhook operations idempotent.
-   Return machine-readable success/error responses.

n8n is responsible for orchestration; backend remains responsible for
business rules and persistence.

------------------------------------------------------------------------

# 37. Idempotency

This is critical.

Retries must not create:

-   duplicate Businesses
-   duplicate Leads
-   duplicate WebsiteVersions
-   duplicate Activities where the same operation is replayed
-   duplicate campaign executions

Use:

-   database unique constraints
-   idempotency keys where appropriate
-   deterministic external identifiers
-   transaction boundaries

Do not solve idempotency only with in-memory variables.

------------------------------------------------------------------------

# 38. Transactions

Use Prisma transactions for logically atomic operations.

Examples:

### Lead analysis

``` text
calculate score
+
persist score
+
persist analysis
+
persist recommendation
+
persist deal estimate
+
record LEAD_ANALYZED
+
update lead status
```

### Lead status transition

``` text
validate transition
+
update lead
+
record activity
```

These should be transactionally consistent whenever practical.

------------------------------------------------------------------------

# 39. Error Handling

Use a consistent API error format.

Suggested:

``` json
{
  "error": {
    "code": "LEAD_NOT_FOUND",
    "message": "Lead not found"
  }
}
```

Use appropriate HTTP status codes.

Suggested categories:

``` text
400 = validation error
401 = unauthenticated
403 = unauthorized
404 = resource not found
409 = conflict / invalid state / duplicate
422 = semantically invalid input
429 = rate limited
500 = unexpected server error
502/503 = external dependency failure
```

Do not expose stack traces, database credentials, or secrets to clients.

------------------------------------------------------------------------

# 40. Failure Behavior

The product documentation specifies:

  -----------------------------------------------------------------------
  Failure                             Expected behavior
  ----------------------------------- -----------------------------------
  One bad lead                        Skip/retry that lead; campaign
                                      continues

  Ollama timeout                      Retry, then mark AI job failed

  Invalid AI JSON                     Repair/retry, then manual retry

  Website unreachable                 Record status and continue

  Template error                      Mark website job failed without
                                      losing lead

  n8n failure                         Persist execution/error information
                                      and allow retry

  Duplicate discovery                 Unique constraint prevents
                                      duplicate canonical business
  -----------------------------------------------------------------------

The backend must preserve the campaign and lead even when an individual
downstream operation fails.

------------------------------------------------------------------------

# 41. Security Requirements

Implement:

-   password hashing
-   secure sessions
-   HTTP-only cookies
-   Zod validation for all external input
-   authorization checks on every user-owned resource
-   authenticated n8n webhooks
-   environment variables for secrets
-   rate limiting for public/AI-triggering endpoints where practical
-   sanitization of user-generated website content
-   database constraints for idempotency
-   defensive handling of untrusted external website data

Never commit:

``` text
DATABASE_URL
AUTH_SECRET
API keys
storage credentials
N8N webhook secret
```

------------------------------------------------------------------------

# 42. Environment Variables

Expected configuration:

``` env
DATABASE_URL=
AUTH_SECRET=
APP_URL=http://localhost:3000

N8N_URL=http://n8n:5678
N8N_WEBHOOK_SECRET=

OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=

BUSINESS_DATA_API_URL=
BUSINESS_DATA_API_KEY=

STORAGE_ENDPOINT=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
```

Only add variables that are actually required by the implementation.

------------------------------------------------------------------------

# 43. Backend Implementation Order

Claude Code should implement in this order.

## Phase 0 --- Inspect

-   [ ] Inspect repository
-   [ ] Identify existing Next.js app
-   [ ] Identify package manager
-   [ ] Identify Prisma setup
-   [ ] Identify PostgreSQL setup
-   [ ] Identify existing auth
-   [ ] Identify existing API patterns
-   [ ] Identify existing TypeScript conventions
-   [ ] Do not rewrite working infrastructure unnecessarily

## Phase 1 --- Database Foundation

-   [ ] Prisma schema
-   [ ] enums
-   [ ] relationships
-   [ ] indexes
-   [ ] unique constraints
-   [ ] migrations
-   [ ] seed data
-   [ ] Prisma client
-   [ ] database utility

## Phase 2 --- Validation + Domain Types

-   [ ] Campaign schemas
-   [ ] Lead schemas
-   [ ] Business schemas
-   [ ] Website schemas
-   [ ] Pitch schemas
-   [ ] Settings schemas
-   [ ] n8n webhook schemas
-   [ ] shared enums/types

## Phase 3 --- Domain Services

-   [ ] campaign service
-   [ ] lead service
-   [ ] business normalization
-   [ ] deduplication
-   [ ] scoring engine
-   [ ] service recommendation
-   [ ] lead lifecycle transitions
-   [ ] activity service
-   [ ] pricing/service configuration

## Phase 4 --- Core APIs

-   [ ] campaign CRUD
-   [ ] campaign run
-   [ ] lead list/detail/update
-   [ ] lead analysis
-   [ ] website APIs
-   [ ] pitch generation
-   [ ] WhatsApp-ready action
-   [ ] analytics
-   [ ] settings

## Phase 5 --- AI Integration

-   [ ] Ollama client
-   [ ] prompt versioning
-   [ ] Zod response validation
-   [ ] repair retry
-   [ ] AI execution metadata
-   [ ] failure states

## Phase 6 --- n8n Contracts

-   [ ] authenticated webhook endpoints
-   [ ] idempotency
-   [ ] execution status/error persistence
-   [ ] backend-triggered orchestration contracts

## Phase 7 --- Testing

-   [ ] unit tests for scoring
-   [ ] unit tests for state transitions
-   [ ] API validation tests
-   [ ] deduplication tests
-   [ ] AI response validation tests
-   [ ] integration tests against PostgreSQL
-   [ ] critical end-to-end backend flow

------------------------------------------------------------------------

# 44. Critical Backend Test

The backend should support this complete path:

``` text
1. Create Campaign
2. Run Campaign
3. DemoProvider returns businesses
4. Businesses normalized
5. Duplicates removed
6. Leads created
7. Enrichment data persisted
8. Deterministic score calculated
9. Ollama analysis completes
10. AI response validated
11. Service recommendation persisted
12. Estimated deal persisted
13. Qualified lead can trigger website generation
14. WebsiteProject persisted
15. WebsiteVersion persisted
16. Pitch generated
17. WhatsApp-ready action generated
18. Operator confirms pitch
19. Lead becomes PITCHED
20. Activity timeline contains the important events
21. Analytics reflect the resulting state
```

The backend is not complete until this path can execute without manual
database edits.

------------------------------------------------------------------------

# 45. Test Failure Cases

At minimum, test:

### Duplicate business

Given:

``` text
source = "demo"
externalId = "demo-001"
```

and the same business arrives again:

Expected:

``` text
No duplicate Business
```

### Invalid lead transition

Given:

``` text
NEW -> WON
```

Expected:

``` text
409 Conflict
No state mutation
No WON activity
```

### Invalid AI JSON

Expected:

``` text
Initial response invalid
→ repair attempt
→ if still invalid, job fails
→ lead is not corrupted
→ manual retry remains possible
```

### Ollama timeout

Expected:

``` text
Retry
→ failure state if retries exhausted
→ campaign/lead remains persisted
```

### Unauthorized lead access

User A requests User B's lead.

Expected:

``` text
403 or 404
No data leakage
```

### Website generation failure

Expected:

``` text
Website job fails
Lead remains intact
Campaign remains intact
Retry possible
```

------------------------------------------------------------------------

# 46. Definition of Done --- Backend

Backend work is complete when all of the following are true:

-   [ ] PostgreSQL is the source of truth.
-   [ ] Prisma schema is migrated and validated.
-   [ ] Seeded DemoProvider data exists.
-   [ ] Businesses are normalized.
-   [ ] Businesses are deduplicated.
-   [ ] Campaigns can be created.
-   [ ] Campaigns can be run through the backend orchestration contract.
-   [ ] Leads are created and persisted.
-   [ ] Lead lifecycle is enforced.
-   [ ] Deterministic opportunity score works.
-   [ ] Score totals exactly 100 points.
-   [ ] Score classification works.
-   [ ] Service recommendation works.
-   [ ] Pricing is configurable.
-   [ ] Ollama output is schema-validated.
-   [ ] Invalid AI output gets one repair attempt.
-   [ ] AI failures are recoverable.
-   [ ] Website projects can be persisted.
-   [ ] Website versions are preserved.
-   [ ] Pitches can be generated and persisted.
-   [ ] WhatsApp-ready actions can be generated without automatic
    sending.
-   [ ] Activities are recorded.
-   [ ] Analytics are derived from database state.
-   [ ] n8n webhook calls are authenticated.
-   [ ] User authorization is enforced.
-   [ ] Secrets are environment-based.
-   [ ] Duplicate/retry behavior is idempotent.
-   [ ] Critical backend tests pass.

------------------------------------------------------------------------

# 47. Claude Code Operating Instructions

Claude Code should follow these rules throughout implementation.

## Rule 1 --- Inspect before changing

Before creating files:

``` text
inspect the repository
→ understand current architecture
→ identify existing patterns
→ reuse existing utilities
→ then implement
```

Do not assume the repository is empty.

## Rule 2 --- Backend first

Do not spend time implementing:

-   dashboard UI
-   navigation
-   frontend styling
-   shadcn components
-   animations
-   frontend state management

The task is Backend + DB.

## Rule 3 --- Database first

Any persisted domain concept must have a proper Prisma model and
migration.

Do not use random JSON blobs as a substitute for relational structure
unless the field is intentionally JSON, such as controlled AI/template
content.

## Rule 4 --- Domain logic outside route handlers

Avoid large route handlers.

Prefer:

``` text
route.ts
  ↓
validation
  ↓
service
  ↓
repository/Prisma
  ↓
response
```

## Rule 5 --- Validate all external input

External input includes:

-   frontend requests
-   n8n webhooks
-   provider responses
-   Ollama responses
-   URL/query parameters

Use Zod.

## Rule 6 --- Never trust AI output

Ollama output is untrusted.

Always:

``` text
AI → parse → Zod → business validation → persist
```

Never:

``` text
AI → database
```

## Rule 7 --- Never bypass business rules

Do not let API clients directly force:

``` text
score
status
recommendation
deal value
```

when these values are controlled by backend domain logic.

## Rule 8 --- Preserve failure recovery

A failure affecting one lead must not destroy the campaign or other
leads.

## Rule 9 --- Keep changes small

After each meaningful implementation step:

``` bash
typecheck
lint
test
prisma validate
```

Use the project's actual package scripts when available.

## Rule 10 --- Do not silently invent requirements

If the documentation does not define a behavior:

1.  inspect existing code
2.  choose the smallest reasonable implementation
3.  document the assumption
4.  do not introduce a large architectural feature without need

------------------------------------------------------------------------

# 48. Suggested Claude Code Prompt

Use this as the initial instruction to Claude Code:

``` text
Read BACKEND_TASK_README.md completely before making changes.

You are implementing only the Backend + PostgreSQL/Prisma portion of Sarrvai Goldmine.

First inspect the existing repository. Do not assume the repository is empty and do not rewrite existing working infrastructure unnecessarily.

Your responsibilities:
- PostgreSQL + Prisma schema
- migrations
- seed data
- backend API routes
- authentication/authorization
- Zod validation
- domain/business logic
- lead normalization and deduplication
- deterministic opportunity scoring
- service recommendation
- configurable pricing
- Ollama integration and structured-output validation
- website/pitch persistence
- lead lifecycle/state transitions
- Activity event recording
- analytics queries
- n8n webhook contracts
- idempotency
- backend tests

Do NOT implement frontend UI or n8n workflow JSON as part of this task.

Use the README as the source of truth. Preserve the architecture boundary:
Backend = business logic/API
PostgreSQL = source of truth
n8n = orchestration
Ollama = intelligence

Before coding:
1. Inspect repository structure.
2. Identify existing package manager and scripts.
3. Inspect existing Prisma/database setup.
4. Inspect existing auth.
5. Inspect existing API conventions.
6. Report what already exists and what is missing.
7. Propose the smallest implementation plan.

Then implement in small, verifiable steps.

After each major step, run the relevant validation/typecheck/tests.

Do not mark a task complete unless it has been implemented and verified.

Critical requirements:
- deterministic score totals 100
- enforce lead lifecycle transitions
- database-level deduplication
- Zod validation for all external input
- Zod validation after every Ollama response
- one repair retry for invalid AI JSON
- configurable pricing
- activity events for important state changes
- idempotent retry behavior
- authenticated n8n webhooks
- no plaintext passwords
- no secrets committed to source
- no automatic personal-WhatsApp bulk sending
```

------------------------------------------------------------------------

# 49. Final Sprint Priority

If time becomes limited, prioritize in this order:

### P0 --- Must work

``` text
PostgreSQL
↓
Prisma schema
↓
Seed data
↓
Campaign
↓
Business
↓
Lead
↓
Deduplication
↓
Deterministic scoring
↓
Lead lifecycle
↓
Activity
↓
Core APIs
```

### P1 --- Required for product flow

``` text
Ollama structured output
↓
Service recommendation
↓
WebsiteProject persistence
↓
WebsiteVersion
↓
Pitch persistence
↓
WhatsApp-ready link
↓
Analytics
```

### P2 --- Integration/reliability

``` text
n8n webhooks
↓
Idempotency
↓
Retry/error persistence
↓
Rate limiting
↓
Additional integration tests
```

Do not sacrifice the database model, lifecycle rules, validation, or
data integrity merely to add more endpoints.

------------------------------------------------------------------------

# 50. Source Alignment

This README is derived from the Sarrvai Goldmine Version 1.0
technical/product documentation.

Key source sections used:

-   **Pages 2--3:** architecture and responsibility boundaries
-   **Pages 5--6:** backend structure, provider abstraction, scoring,
    service recommendations
-   **Pages 7--8:** AI validation rules, database entities, lead
    lifecycle and activity events
-   **Pages 9--10:** workflow boundaries and website factory contracts
-   **Page 11:** security, reliability and environment variables
-   **Pages 12--14:** local development, testing, one-day implementation
    plan, roadmap and final product contract

The original documentation explicitly states that the strongest
implementation strategy is a modular monorepo where backend APIs own
domain rules and database writes, while n8n coordinates asynchronous
jobs.
