# Admin developer console (`/admin/dev`)
#
| Field | Value |
|-------|-------|
| Flag | `TORE_ADMIN_DEVTOOLS_V1=1` |
| Production | **Hard-disabled** (`NODE_ENV=production` ignores the flag) |
| Audience | Local / staging QA — never ship enabled to production |

## Capabilities

- List CLIENT + LAWYER accounts with directory blockers
- **Login as** (JWT impersonation; amber banner + Stop)
- Mark email verified
- Force verification APPROVED / reset PENDING
- Ensure active consultation offering (create stub or reactivate)
- Toggle marketplace listing (`isListed`)
- **Make directory-ready** one-click (email + APPROVED + offering + listed)
- Bulk-approve all SUBMITTED credentials

## Enable locally

```bash
# .env
TORE_ADMIN_DEVTOOLS_V1=1
```

Restart `next dev`, sign in as seeded admin (`SEED_ADMIN_EMAIL`), open `/admin/dev`.

## Security notes

- Requires `UserRole.ADMIN` for mutating actions
- Cannot impersonate other admins
- Impersonation stores `impersonatorId` on JWT; privilege refresh still loads the **impersonated** user
- Audit log entries include `metadata.adminDevtools: true`
