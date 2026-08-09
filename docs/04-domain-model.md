# 4. Domain Model

| Field | Value |
|-------|-------|
| Document | Domain Model |
| Status | Draft for approval |

---

## 4.1 Ubiquitous language (MVP)

| Term | Meaning |
|------|---------|
| **Client** | Person seeking legal consultation via marketplace |
| **Lawyer** | Licensed attorney offering paid consultations |
| **Listing** | Public visibility of an approved lawyer with active offerings |
| **Offering** | Priced consultation product (duration + MNT price) |
| **Availability** | Weekly rules + dated exceptions defining bookable slots |
| **Booking** | Scheduled consultation reservation between client and lawyer |
| **Platform fee** | Percentage retained by TORE from successful payment |
| **Payout** | Lawyer net amount marked paid by admin (MVP: manual) |
| **Meeting instructions** | External call link + text instructions for a confirmed booking (not in-app video) |
| **Thread** | Message conversation bound 1:1 to a confirmed booking |
| **Review** | Rating left only after completed paid consultation |

TORE is a **marketplace intermediary**, not a law firm and not a source of legal advice.

---

## 4.2 Bounded contexts & aggregates

### Identity

| Aggregate root | Children / related |
|----------------|--------------------|
| **User** | Account, Session, VerificationToken, TermsAcceptance |

Invariants: unique email; role immutable after register (MVP); suspended users cannot book/payout.

### Marketplace — Profiles & trust supply

| Aggregate root | Children / related |
|----------------|--------------------|
| **LawyerProfile** | LawyerCredential, LawyerPracticeArea, LawyerLanguage |
| **ClientProfile** | — |
| **PracticeArea** / **Language** | Reference data |

Invariants:

- Only `APPROVED` lawyers may become listable.
- `isListed` requires approval + eligibility policy (+ ≥1 active offering in product rules).
- Slug unique and stable for public URLs.

### Marketplace — Catalog

| Entity | Notes |
|--------|-------|
| **ConsultationOffering** | Priced product owned by a lawyer |
| **AvailabilityRule** / **AvailabilityException** | Consistency boundary is the lawyer’s availability set (not each row as an independent “business aggregate”); still persisted as separate tables |

Invariants: prices in integer MNT; duration > 0; rules `startTime < endTime`; exceptions can block or open windows.

### Marketplace — Booking

| Aggregate root | Children / fields |
|----------------|-------------------|
| **Booking** | BookingStatusHistory; meeting fields; optimistic `version` |

Invariants:

- Unique `bookingNumber`
- No overlapping active bookings for same lawyer slot
- Status transitions only via state machine
- Every transition appends history
- `meetingUrl` / `meetingInstructions` optional until lawyer provides (typically on accept/confirm)
- Concurrent updates use optimistic concurrency (`version`)

**Default entry status:** new marketplace bookings normally enter `PENDING_PAYMENT`. `DRAFT` is reserved for incomplete holds if product needs them later.

### Payments

| Aggregate root | Children / related |
|----------------|--------------------|
| **Payment** | Payout (1:1), Refunds (N) |

Invariants: `amountMnt = platformFeeMnt + lawyerNetMnt`; fee snapshot immutable after success; webhook id unique.

**Dispute** is **not** a Payment child. Dispute is Booking-scoped (1:1 with booking). Admin orchestration may touch both Booking dispute state and Payment refunds.

### Messaging

| Aggregate root | Children |
|----------------|----------|
| **MessageThread** | Message → MessageAttachment |

Invariant: one thread per booking; created when booking becomes `CONFIRMED` (product rule).

### Trust & ops

| Aggregate root | Notes |
|----------------|-------|
| **Review** | One per booking; rating 1–5; denormalize onto LawyerProfile |
| **Dispute** | One per booking; manual admin resolution |
| **Notification** | Per-user inbox records |
| **AuditLog** | Append-only |
| **PlatformSetting** | Key/value operational config |

---

## 4.3 Booking lifecycle

```text
DRAFT
  → PENDING_PAYMENT
    → PENDING_ACCEPTANCE
      → CONFIRMED
        → IN_PROGRESS
          → COMPLETED

Also: CANCELLED | REFUNDED | DISPUTED (terminal / special paths)
```

Domain service: `booking-state-machine` — sole authority for allowed transitions.

**Terminal clarity:**

- Money-terminal: `REFUNDED` (no further money transitions).  
- Lifecycle closed: `COMPLETED`, `CANCELLED` (may still move to `DISPUTED` / `REFUNDED` per machine rules).  
- Do not treat “terminal-ish” loosely in application code — always call `canTransitionBooking`.

---

## 4.4 Domain services (already in codebase — keep)

| Service | Responsibility |
|---------|----------------|
| `rbac` | Dashboard paths, route access helpers |
| `lawyer-eligibility` | Verified / listed / bookable / credential gates |
| `slug-generator` | Lawyer public slug candidates |
| `booking-state-machine` | Transition rules |
| `booking-number` | Human-readable booking numbers |
| `slot-availability` | Weekly rules, exceptions, conflicts |
| `fee-calculator` | Platform fee + lawyer net |
| `cancellation-policy` | Refund % by actor/timing |
| `rating-aggregator` | Next average/count after review |

New domain logic should prefer extending these pure functions over encoding rules in UI.

---

## 4.5 Value objects

| VO | Meaning |
|----|---------|
| **Money** | Integer MNT amounts; arithmetic/guards |
| **TimeSlot** | Weekly/dated/instant ranges; overlap helpers |

---

## 4.6 Repository ports (interfaces)

Group by context (names reflect current interfaces):

- Identity: `UserRepository`, `TermsAcceptanceRepository`, `AuditLogRepository`, `PlatformSettingRepository`
- Profiles: `ClientProfileRepository`, `LawyerProfileRepository`, `LawyerCredentialRepository`
- Taxonomy: `PracticeAreaRepository`, `LanguageRepository`, lawyer taxonomy joins
- Catalog: `ConsultationOfferingRepository`, `AvailabilityRepository`
- Booking: `BookingRepository`
- Payments: `PaymentRepository`, `PayoutRepository`, `RefundRepository`, `DisputeRepository`
- Messaging: `MessageThreadRepository`, `MessageRepository`
- Trust: `ReviewRepository`, `NotificationRepository`

Implementations live only under infrastructure.

---

## 4.7 Business rules (SRS → domain)

1. Only verified (approved) lawyers appear in searchable directory.  
2. Booking confirms after **payment success** and **lawyer acceptance** (pay → accept → confirm).  
3. Reviews only for completed paid consultations.  
4. Platform fee applied before payout.  
5. Cancellation/refund follows hours-before policy settings.  
6. Disputes are Booking-scoped and handled manually by admin in MVP; refunds are Payment-scoped.  
7. Double-booking forbidden for active statuses.  
8. Consultation delivery uses **external** meeting URL/instructions (no in-app video).

---

## 4.8 Context isolation rules

- **Do not** introduce Organization / Matter / Document aggregates into Marketplace MVP.  
- **Do not** reuse `ClientProfile` for future firm CRM clients.  
- Shared Kernel types (User id, Money, Audit) may be referenced; marketplace internals stay local.
