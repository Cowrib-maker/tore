# Admin control center: site content and role preview

Branch `admin-control-center`, based on `origin/main` (74fddfb). Uncommitted. Not deployed.

## Routes (all ADMIN-only, server-enforced)
| Route | Purpose |
|---|---|
| `/admin/content` | Searchable list of editable public text, grouped by section, with draft/published state per language |
| `/admin/content/[key]` | Edit Mongolian and English side by side: preview, save draft, publish, discard draft, revert to built-in text, revision history, restore |
| `/admin/preview` | Choose a page and a synthetic role |
| `/admin/preview/[page]?context=&locale=&content=` | Real `LandingPage` / `LegalAiAccessGateCard` rendered read-only for the chosen synthetic role; `content=draft` overlays unpublished drafts |

## Editable text (12 keys, `src/domain/site-content/registry.ts`)
Homepage hero (brand line, tagline, chat title, chat subtitle), introduction (title, text), products eyebrow, and the five product descriptions (citizen, student, lawyer, firm, team). Languages: Mongolian and English. Korean/Chinese keep the built-in text.
Plain text only (no `<` or `>`, no control characters, length limits). Existing text already passes validation (test-enforced).
Not editable by design: prices, billing/payment/licence/entitlement logic, authorization, security messages, legal terms, privacy and billing-policy text. A test fails if a registry key touches those areas.

## Model
- `site_content_entries` (key, locale): `draft_value`, `published_value`, `version` (optimistic lock), `revision_counter`, who/when.
- `site_content_revisions`: immutable snapshot per publish.
- Every write must send the `version` it read; a mismatch is a conflict and nothing is written.
- Publish, unpublish and restore write their `audit_logs` row (`UPDATE`, entity `SiteContent`, `metadata.event` = publish / unpublish / restore_revision) in the same database transaction as the change. If the audit insert fails, the change is rolled back.
- Restoring a revision loads it into the draft; it goes live only through a normal publish.
- Public pages read published values through `unstable_cache` tagged `site-content`; publish/unpublish call `updateTag` + `revalidatePath("/")`. Any failure to read falls back to the built-in text.

## Role preview
Synthetic identities, never a real session: no cookie or session change, no impersonation. The previewed subtree is `inert` (no click, focus, submit or navigation), a banner states page, role, language and content mode, and the preview code is test-verified not to import sessions, payment, e-mail, storage, licence code or server actions. Entitlement states (subscription, lawyer access) are declared scenarios, not computed from any account; real endpoints still enforce real entitlements on the real session.
Supported: anonymous, newly registered user, citizen with/without subscription, lawyer with/without entitlement. Not supported (explained in the UI): student and organization/team roles, which do not exist as user roles.

## Migration
`prisma/migrations/20261002090000_site_content` (additive: two new tables). The timestamp sorts before the Spell migrations so the Spell migration-order invariant still holds after a merge.

## Known limitations
See the final report: the browser tab title / search preview and the footer tagline are separate code-owned strings; only the pages wired to the loader (the homepage) show published text.

## Phase 2 — content across the website

**Editable now (54 keys on this branch; 82 when the Spell branch is present).** All plain text, Mongolian + English, draft / preview / publish / history / revert-to-default.
- Homepage: hero, Legal AI chat introduction (title, subtitle, input hint, send button, 5 example questions), introduction, product descriptions + button text (5 products), marketplace block, FAQ (heading + 4 questions/answers), legal-intelligence block, feedback/help text.
- Shared: top navigation (7 labels), footer description, default browser title + search description (also Open Graph / Twitter).
- TORE Spell page (needs the Spell branch): hero, features, download/system-requirements instruction, "how to get it" steps, browser title/description. NOT offered: prices, purchase/checkout wording, licence rules, the unsigned-installer notice, payment messages.

**Pages wired to published text:** `/`, `/student`, `/lawyers`, `/lawyers/[slug]` (shared navigation/footer), root metadata; `/spell` and `/spell/license` via `spell-surface/2-spell-pages.patch`.

**Preview pages:** homepage, student hub, Legal AI access gate (+ Spell page via `spell-surface/1-preview-spell.patch`).

**Retired `/admin/homepage` editor.** It saved overrides the live site never read. The page now explains this, lists the saved legacy edits, and can import the ones that map onto current keys **as unpublished drafts** (existing work in the new system is never overwritten; nothing goes live by itself). The `homepage_contents` table is not modified or deleted. Its save action now refuses to write. Section images stored by the old page remain in the database untouched (no public page reads them).

**Dead key removed:** `home.products.eyebrow` (no page ever displayed it).

**Spell integration bundle** (`docs/admin/spell-surface/`): two patches, each verified with `git apply --check` against its target (not applied): `1-preview-spell.patch` applies to this branch once Spell is merged; `2-spell-pages.patch` applies to the Spell branch's `/spell` pages. `tests/unit/site-content-spell.test.tsx` is skipped where Spell is absent and runs for real where both exist.

**Known limits:** `/legal-ai` (the chat application), sign-in/registration pages, billing pages and the lawyer workspace do not read published text; terms/privacy are intentionally excluded. Cache invalidation uses Next's tag cache: correct on a single server and on platforms with a shared cache; a self-hosted multi-server deployment needs a shared cache handler.
