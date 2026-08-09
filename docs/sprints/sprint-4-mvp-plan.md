# Sprint 4 — Public marketplace MVP (demand validation)

| Field | Value |
|-------|-------|
| **Status** | **COMPLETE** — request/accept marketplace loop shipped |
| **Product goal** | First public MVP: real lawyers register; real clients discover and request consultations |
| **Strategy** | Collapse former S4–S6 discovery + catalog + booking-request into one sprint |
| **Payment** | **Out of scope** — request/accept only (Option A) |
| **Deferred forever from this sprint** | AI Client, TORE Pro / Harvey, Contract AI, Litigation AI, CRM, DMS, Enterprise, Uulen.ai |

---

## Why this reshuffle (startup lens)

Former plan split catalog (S4), public directory (S5), and booking (S6). That delays the first closed loop where a client and lawyer actually interact.

**Marketplace value is created when:**

1. Verified lawyers can publish offerings + availability and appear in a directory  
2. Clients can open a profile and request a consultation  
3. Lawyers can accept or reject — client is notified  

Payments, messaging depth, and AI do not validate demand; a working request loop does.

---

## Sprint 4 scope (must ship)

### 1. Public lawyer directory
- Routes: `/lawyers` (guest + authenticated)
- Search (name / headline)
- Filters: practice area (categories), languages, location (city/region text on profile), sort (rating / newest)
- Only **listable** lawyers: `APPROVED` + `isListed` + ≥1 active offering
- Verified badge on cards

### 2. Public lawyer profile
- Route: `/lawyers/[slug]`
- Biography, experience, practice areas, languages
- Offerings with fixed MNT pricing + duration + online / in-person modality
- Reviews **placeholder** (real reviews later sprint)
- Availability preview (upcoming bookable slots from rules)

### 3. Lawyer offerings
- Routes: `/lawyer/offerings`
- CRUD: consultation types, duration, fixed price (MNT), online / in-person
- Active flag feeds listing eligibility

### 4. Availability
- Routes: `/lawyer/availability`
- Weekly schedule rules
- Manual exceptions / overrides (“manual availability”)
- Generated time slots for preview + booking

### 5. Booking request flow (no payment)
```text
Client selects offering + slot
  → Booking created as PENDING_ACCEPTANCE
  → Lawyer Accept → CONFIRMED (+ client notification)
  → Lawyer Reject → CANCELLED (+ client notification + reason)
  → Status visible on client & lawyer booking dashboards
```

**Explicitly not in Sprint 4:** payment gateway, escrow, invoices, payouts, `PENDING_PAYMENT` usage in the happy path, fee splits, webhooks.

---

## Booking domain model (preserve for later payments)

Keep existing `BookingStatus` enum including `PENDING_PAYMENT`.

| Phase | Create path | Notes |
|-------|-------------|--------|
| **Sprint 4** | Create directly in `PENDING_ACCEPTANCE` (or `DRAFT → PENDING_ACCEPTANCE`) | Additive SM transition allowed |
| **Later payments sprint** | Insert `PENDING_PAYMENT` (+ stub/live gateway) **before** acceptance | **No renames** of statuses; fee/payment aggregates attach without replacing the request model |

Reject maps to `CANCELLED` with reason in history/metadata. Accept maps to `CONFIRMED` (meeting URL can remain empty until a later polish sprint).

Notifications: reuse `BOOKING_CREATED` / `BOOKING_ACCEPTED` / `BOOKING_DECLINED` (in-app minimum).

---

## Additive schema expected in Sprint 4

| Change | Purpose |
|--------|---------|
| `LawyerProfile.city` (or `locationLabel`) | Location filter / display |
| Offering **modality** (`ONLINE` \| `IN_PERSON` \| both as needed) | Public pricing cards |
| Booking create fields already largely present | Slot, offering, issue summary |
| Optional: `meeting_url` / `version` if missing | Do not require payment tables |

No payment tables activated in UI or use-cases this sprint.

---

## Exit criteria

- [ ] Guest can browse `/lawyers` and only see listable verified lawyers  
- [ ] Guest/client can open `/lawyers/[slug]` with offerings + slot preview  
- [ ] Lawyer manages offerings + weekly/manual availability  
- [ ] Authenticated client can submit a booking request  
- [ ] Lawyer accept/reject updates status; client receives in-app notification  
- [ ] No payment provider, stub checkout, or payout code paths required to demo  
- [ ] Tests for listing eligibility, slot conflict, booking SM transitions used in S4  
- [ ] Docs updated when sprint completes  

---

## Out of scope (do not start)

- AI Legal Assistant / Client AI  
- TORE Pro / Harvey workspace modules  
- Contract / litigation / evidence AI  
- CRM, DMS, time tracking, firm enterprise  
- Uulen.ai  
- Live or stub **payment** collection  
- Messaging threads (can deep-link later)  
- Real reviews aggregate writes (placeholder UI only)  

---

## Suggested sprint sequence after S4

| Sprint | Focus |
|--------|--------|
| **S4 (this)** | Directory + profile + offerings + availability + **request/accept** |
| **S5** | Payments (stub → then provider) inserted before acceptance **or** post-accept hold — Product chooses; statuses already exist |
| **S6** | Messaging on confirmed bookings |
| **S7** | Reviews + richer notifications / email |
| **S8+** | Admin ops, legal pages, hardening; AI/Pro only after marketplace loop is live |

Former S5–S6 content is absorbed into **this S4**. Former S7 payments become the **next** monetization sprint.

---

## Implementation posture

- Clean Architecture + modular monolith unchanged  
- Keep auth, i18n, routing conventions  
- No duplicate business logic — use existing eligibility, slot-availability, booking SM  
- Production-quality; tests on every use-case  
- Implement only when Product says go  

**Decision lock (2026-08-09):** Sprint 4 = booking **requests only** (Option A). Payment later without renaming booking statuses.
