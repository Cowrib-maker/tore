# Sprint 4 — Public marketplace MVP

| Field | Value |
|-------|-------|
| Status | **COMPLETE** (request-only marketplace loop) |
| Scope | Directory, profiles, offerings, availability, booking requests, accept/reject, notifications |
| Explicitly deferred | Payments, messaging depth, reviews write-path, Client AI, TORE Pro / Harvey, CRM, DMS, Enterprise, Uulen.ai |

---

## Delivered

| Item | Detail |
|------|--------|
| Public directory | `/lawyers` — text search, practice area, language, city filters; verified badge; listable only |
| Public profile | `/lawyers/[slug]` — bio, city, education, areas, languages, offerings, slot preview, reviews placeholder |
| Offerings CRUD | `/lawyer/offerings` — duration, fixed MNT, ONLINE / IN_PERSON, active flag |
| Availability | `/lawyer/availability` — weekly rules + exceptions → generated slots |
| Taxonomy | Practice areas & languages on `/lawyer/profile` |
| Booking requests | Client form on public profile → `PENDING_ACCEPTANCE` (no payment) |
| Accept / Reject | `/lawyer/bookings` → `CONFIRMED` / `CANCELLED` + status history |
| Notifications | In-app create on request/accept/reject; `/client/notifications` + `/lawyer/notifications` |
| Dashboards | Lawyer + client nav/cards wired to marketplace surfaces |
| Schema | `LawyerProfile.city` / `education`; `ConsultationModality`; SM `DRAFT → PENDING_ACCEPTANCE` |
| Tests | `generate-slots`, `booking-requests`, booking SM Sprint 4 path |

## Exit criteria

- [x] Guest discovers verified, listable lawyers
- [x] Client requests consultation without payment
- [x] Lawyer accepts or rejects; client notified
- [x] Status tracked (`PENDING_ACCEPTANCE` → `CONFIRMED` / `CANCELLED`)
- [x] No payment / AI / Pro features in path

## Next (Sprint 5+)

Payments (insert `PENDING_PAYMENT`), messaging, reviews write-path — see `docs/08-sprint-implementation-plan.md`.
