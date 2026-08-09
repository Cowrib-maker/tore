# 11. Coding Conventions

| Field | Value |
|-------|-------|
| Document | Coding Conventions |
| Status | Draft for approval |

---

## 11.1 Language & style

| Topic | Convention |
|-------|------------|
| Language | TypeScript, strict |
| Components | React function components |
| Files | `kebab-case.ts` / `kebab-case.tsx` |
| Types / classes | `PascalCase` |
| Functions / variables | `camelCase` |
| Constants / enums | `PascalCase` enums matching Prisma; `SCREAMING_SNAKE` sparingly for true constants |
| DB columns | `snake_case` via `@map` |
| Routes | App Router file conventions |

---

## 11.2 Layering conventions

### Domain

- Pure TypeScript only  
- No NestJS/Next/Prisma imports  
- Prefer functions for domain services  
- Throw domain errors (`DomainError` hierarchy), not HTTP errors  

### Application

- One use-case per file named for the action (`register-client.ts`, `accept-booking.ts`)  
- Use-cases orchestrate **domain ports** + domain services  
- Zod schemas live under `application/validators`  
- Server Actions / webhook handlers are thin composition roots: parse → auth → wire adapters → use-case → map result  
- Prefer use-case signatures that accept repository/port interfaces (injectable). Avoid new direct imports of `infrastructure/repositories` concrete files; migrate existing S1 auth use-cases when touched  

### Infrastructure

- `prisma-*-repository.ts` implements domain ports  
- Mappers convert Prisma models ↔ domain entities  
- External adapters behind interfaces (`EmailSender`, `PaymentGateway`, `FileStorage`)  
- Webhook routes must not query Prisma directly — call an application use-case  

### Presentation

- Server Components by default  
- Client components only for interactivity  
- No business rules in components beyond display/formatting  

---

## 11.3 Naming patterns

| Kind | Pattern | Example |
|------|---------|---------|
| Use-case | `verbNounUseCase` or `verb-noun.ts` export | `registerLawyerUseCase` |
| Action | `noun.actions.ts` | `auth.actions.ts` |
| Schema | `noun.schema.ts` | `auth.schema.ts` |
| Repo interface | `NounRepository` | `BookingRepository` |
| Repo impl | `PrismaNounRepository` / exported singleton | `bookingRepository` |
| Domain error | `SomethingError` | `InvalidStateTransitionError` |

---

## 11.4 Result & error handling

- Prefer `action-result` helpers for Server Action responses to the UI  
- Map domain errors to user-safe messages  
- Never leak stack traces or internal IDs unnecessarily in client payloads  
- Use `ConflictError` / auth errors consistently for register/login collisions  

---

## 11.5 Authorization pattern

```text
1. Middleware: coarse route protection
2. Action/use-case: load session
3. Assert role + ownership (e.g. booking.clientUserId === session.user.id)
4. Proceed
```

Admins may access broader surfaces; still audit admin mutations.

---

## 11.6 Prisma conventions

- Access Prisma **only** via infrastructure repositories  
- Transactions for multi-write use-cases (register+profile, pay+status, review+denorm)  
- Prefer `cuid` IDs as already established  
- Integer MNT fields named `*Mnt`  

---

## 11.7 UI conventions

- Reuse `components/ui` (shadcn) primitives  
- Role shells via `dashboard-shell`  
- Sonner for toasts  
- Avoid introducing new component libraries  
- Cards only when needed for interaction (product design rules)  

---

## 11.8 Git commit conventions (recommended)

- Imperative, concise, focus on why  
- Examples: `fix register flow to create client profiles`, `add lawyer credential admin review`  
- Do not commit secrets, `.env`, or generated noise beyond existing `generated/prisma` policy  

---

## 11.9 What not to do

- No `any` without justification  
- No copy-paste of domain rules into UI  
- No second ORM  
- No matter/client CRM models in marketplace modules  
- No silent status changes without `BookingStatusHistory`
