# Sprint 3 — Lawyer verification

| Field | Value |
|-------|-------|
| Status | **COMPLETE** (verification module) |
| Scope | Marketplace V1 foundation — credentials, FileStorage, admin queue |
| Explicitly deferred | Directory, offerings CRUD UI, bookings, Client AI, TORE Pro, Uulen.ai |

---

## Delivered

| Item | Detail |
|------|--------|
| FileStorage port | `src/domain/ports/file-storage.ts` — shared for credentials, photos, contracts, evidence, attachments |
| Local adapter (default) | `LocalFileStorage` — root from `FILE_STORAGE_LOCAL_ROOT` (default `.data/uploads`) |
| S3 adapter (optional) | `S3FileStorage` — enabled when `FILE_STORAGE=s3` + S3_* env |
| Factory | `getFileStorage()` — application never hardcodes paths |
| Download route | `/api/files/[...key]` — ACL for admin + owning lawyer |
| Credential submit | `/lawyer/verification` — license, authority, document upload |
| Admin queue | `/admin/lawyers` — approve / reject with reason, audit + notification |
| Eligibility | Approved lawyers distinguishable; listing still gated on offerings |
| Seed admin | `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (defaults documented in `.env.example`) |
| Tests | `file-storage`, `verification-use-cases`, eligibility submit rules |

## Exit criteria

- [x] Approved lawyer distinguishable (`LawyerVerificationStatus.APPROVED` + badge)
- [x] Rejected has reason + notification
- [x] Audit logged (`APPROVE` / `REJECT` / `CREATE`)
- [x] Storage abstraction selectable by config only

## Next (Sprint 4+)

Offerings & availability CRUD → public directory → bookings — see `docs/08-sprint-implementation-plan.md`.
