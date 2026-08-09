# Sprint 1 — Milestone Log

| Field | Value |
|-------|-------|
| Sprint | 1 — Platform foundation / cleanup |
| Status | **Milestone 1 complete — awaiting approval** |

---

## Milestone 1 — Project cleanup and foundation

**Completed:** 2026-08-09

### Removed (obsolete law-firm leftovers)

| Path | Reason |
|------|--------|
| `src/app/(admin)/` | Empty obsolete route group |
| `src/app/(client)/` | Empty obsolete route group |
| `src/app/(lawyer)/` | Empty obsolete route group |
| `src/app/(dashboard)/` | Empty firm workspace shells (`clients`, `documents`, `matters`) |
| `src/application/use-cases/clients/` | Empty obsolete use-case folder |
| `src/application/use-cases/matters/` | Empty obsolete use-case folder |
| `src/components/clients/` | Empty obsolete UI folder |
| `src/components/dashboard/` | Empty obsolete UI folder |
| `src/components/matters/` | Empty obsolete UI folder |
| `src/lib/validations/` | Empty obsolete folder (validators live under `application/validators`) |

### Kept (reusable foundation)

- Auth.js stack, middleware RBAC, auth use-cases/actions/forms
- Prisma schema + infrastructure repositories/mappers for identity
- Marketplace domain scaffold (entities, ports, domain services) — **not** law-firm; retained for later sprints
- Role dashboards under `src/app/{client,lawyer,admin}/`
- UI kit (`components/ui`), `dashboard-shell`, `lib/{auth,env,utils}`

### Verification

- [x] Obsolete law-firm routes/folders removed
- [x] No law-firm entity/repository/use-case source files remained (already absent pre-cleanup)
- [x] `npm run lint` — **pass**
- [x] `npm run build` — **pass**
- [x] Lint fix: `useIsMobile` rewritten to `useSyncExternalStore` (no setState-in-effect)

### Out of scope for Milestone 1

- Milestone 2+ feature work
- Auth use-case port-injection refactor
- Profile creation on register
- Schema migrations beyond existing marketplace init

---

**STOP — awaiting approval before Milestone 2.**
