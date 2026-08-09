# 13. Deployment Strategy

| Field | Value |
|-------|-------|
| Document | Deployment Strategy |
| Status | Draft for approval |
| Planned host | Vercel (app) + managed PostgreSQL |

---

## 13.1 Environments

| Environment | URL pattern | Data | Payments | Purpose |
|-------------|-------------|------|----------|---------|
| Local | localhost:3000 | Dev DB | Mock/console | Feature building |
| Staging | staging.* | Scrubbed/synthetic | Sandbox | QA + demos |
| Production | app/marketing domain | Live | Live provider | Customers |

Promotion path: **local → staging → production**.

---

## 13.2 Build & release pipeline (target)

```text
PR → lint + unit + build
main → deploy staging
tag/release → migrate → deploy production
```

| Step | Command / action |
|------|------------------|
| Generate client | `prisma generate` (already in `build`) |
| Migrate | `prisma migrate deploy` in release job |
| Seed | Reference data only when needed; never blind prod reseed |
| App | `next build` / host adapter |

---

## 13.3 Configuration

| Category | Examples |
|----------|----------|
| Core | `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` |
| Email | Provider API key, from-address |
| Storage | Bucket, region, credentials |
| Payments | Merchant keys, webhook secret |
| Feature flags (optional) | Discovery public, payments live |

Validate env at startup via `lib/env.ts` pattern (extend as adapters appear).

---

## 13.4 Database operations

- Production migrations are **forward-only**  
- Take backup before risky migrations  
- Daily automated backups with ≥7-day retention (SRS NFR)  
- Document rollback as: restore backup + redeploy previous app artifact (avoid down-migrations)  
- On serverless hosts, use pooled connections (`@prisma/adapter-pg` / provider pooler) and a **single** Prisma client instance per isolate; verify connection limits on staging before launch  

---

## 13.5 Webhooks & cron

| Job | When | Hosting options |
|-----|------|-----------------|
| Payment webhooks | S7 | Next.js route on Vercel |
| Consultation reminders | S9 | Vercel Cron or external scheduler |
| Auto-complete / review nudge | S9 | Same |

Cron endpoints must be authenticated (secret header) and idempotent.

---

## 13.6 Zero-downtime guidelines

- Expand schema before switching app readers/writers  
- Dual-write only when unavoidable  
- Keep Auth.js/session cookie domains consistent across deploys  
- Feature-flag payments if provider cutover is risky  

---

## 13.7 Go-live checklist (S10)

- [ ] Staging golden-path E2E green  
- [ ] Live payment + refund sandbox/production tests signed off  
- [ ] Admin runbook published  
- [ ] Support email monitored  
- [ ] Terms / Privacy / disclaimer live  
- [ ] Security review completed  
- [ ] Backups verified restore  
- [ ] Error monitoring enabled  
- [ ] Seeded/onboarded enough verified lawyers for soft launch  

---

## 13.8 Rollback

1. Revert app deployment to previous immutable build.  
2. If migration is incompatible, restore DB backup (coordination required).  
3. Disable payments feature flag if money path is at fault.  
4. Communicate status to support.

---

## 13.9 Post-MVP hosting evolution

- Consider separate worker for jobs if cron limits bite  
- Consider dedicated object-storage CDN for downloads  
- Keep modular monolith until a module proves need for independent scale
