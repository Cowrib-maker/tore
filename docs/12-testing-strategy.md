# 12. Testing Strategy

| Field | Value |
|-------|-------|
| Document | Testing Strategy |
| Status | Draft for approval |
| Tooling (planned) | Vitest (unit/integration) · Playwright (E2E) |

---

## 12.1 Goals

1. Protect domain invariants (booking, fees, cancellation, eligibility).  
2. Prevent authz regressions.  
3. Prove the go-live E2E marketplace loop.  
4. Keep feedback fast for vertical-slice development.

---

## 12.2 Test pyramid

```text
        /\
       /E2E\        few, critical journeys (Playwright)
      /------\
     / Integr \     repos + use-cases against test DB
    /----------\
   / Unit       \   domain services & pure validators (largest)
  /--------------\
```

---

## 12.3 Unit tests (start Sprint 2)

**Priority targets (already exist as pure functions):**

| Module | Cases |
|--------|-------|
| `booking-state-machine` | Allowed/forbidden transitions; terminal states |
| `fee-calculator` | Fee split rounding; setting parse |
| `cancellation-policy` | Actor × hours-before matrices |
| `slot-availability` | Overlaps, weekly rules, exceptions |
| `rating-aggregator` | Next average/count |
| `lawyer-eligibility` | Listed/bookable gates |
| `slug-generator` / `booking-number` | Format stability |
| Zod schemas | Auth and later module validators |

**Rule:** Domain bugs are fixed in domain + unit tests first.

---

## 12.4 Integration tests

| Focus | Approach |
|-------|----------|
| Prisma repositories | Test database; migrate per suite or transaction rollback |
| Use-cases | Wire real repos; mock email/payment/storage ports |
| Webhooks | Signed payload fixtures; idempotency double-delivery |

Introduce meaningfully from S3/S6 as writes become complex.

---

## 12.5 E2E tests (Playwright)

| Sprint | Journeys |
|--------|----------|
| S2 | Register client/lawyer → verify email happy path |
| S3 | Lawyer submits credential → admin approves |
| S5 | Guest browses directory → opens slug profile |
| S6 | Client creates booking → lawyer accepts (with pay stub if needed) |
| S7 | Paid path with sandbox provider |
| S8–S9 | Message + review |
| S10 | Full golden path regression suite |

**Golden path (S10):**  
register lawyer → admin approve → offerings/availability → client register → book → pay → accept → message → complete → review.

---

## 12.6 Auth & security tests

- Role cannot access other role prefixes  
- Suspended user blocked  
- Lawyer cannot accept another lawyer’s booking  
- Client cannot review uncompleted booking  
- Webhook rejects bad signatures  

---

## 12.7 Non-goals for MVP test suite

- Full visual regression  
- Load testing beyond light staging checks (add if traffic warrants)  
- Contract tests for unused public REST APIs  

---

## 12.8 CI expectations

By **Sprint 4**:

- PR pipeline: lint + unit tests + build  

By **Sprint 10**:

- Staging E2E smoke on main/release  

---

## 12.9 Test data

- Prefer factories over brittle fixtures  
- Never use production data in local/CI  
- Seed reference taxonomy in test setup  
- Isolate payment provider with sandbox keys only  

---

## 12.10 Coverage guidance

- Aim for **high** coverage on `src/domain/services/**`  
- Do not chase 100% UI coverage  
- Require tests for every new state-machine transition or fee rule change
