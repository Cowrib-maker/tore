# TORE — Архитектурын тойм ба гүйцэтгэлийн аудит (2026-09-09)

Энэ баримт `docs/reviews/2026-09-08-repo-sync-and-architecture-review.md`-г **давхардуулахгүйгээр нөхдөг**. Тэнд өгүүлсэн зүйлийг (git sync, өрсөлдөгчидтэй харьцуулалт, хоёр engine-ийн давхардал) энд дахин бичээгүй болно.

Энэхүү аудит нь энэ орчны (device-bridged Linux VM) бодит хязгаарлалтын дор хийгдсэн: сервер ажиллуулж, бодит хүсэлт явуулж хэмжсэн зүйл **байхгүй**. Зөвхөн код унших, static analysis, `tsc`/`eslint` ажиллуулах боломжтой байсан тул доорх бүх дүгнэлт зөвхөн **шууд баталгаажсан зүйлд** үндэслэсэн болно.

## 0. Энэ сешний шинэ нээлт: сүлжээний хандалт маш хязгаарлагдмал

Энэ орчноос (`device_bash`, Windows компьютер дээрх Linux VM bridge) дараах бүх хост руу CONNECT хийхэд `403 Forbidden` буцаж байна:
- `legalinfo.mn`, `shuukh.mn` (өмнөх сешнд илэрсэн)
- `github.com` (`git push`, `git fetch` бүгд амжилтгүй)
- `binaries.prisma.sh` (`npx prisma generate` engine татахад амжилтгүй)

Энэ нь Phase 0/22 ("Do not assume the current infrastructure is the problem") дагуу чухал нээлт: **энэ орчноос бараг ямар ч гадаад сүлжээний ажил хийх боломжгүй**. npm registry (dependency-гүй typecheck/lint/аль хэдийн суусан test tool-ууд) л ажилладаг. Иймд:
- `git push` — та өөрөө өөрийн терминалаас хийх шаардлагатай (доор жагсаав).
- `npx prisma generate` — мөн адил, танай жинхэнэ Windows орчинд (интернэт хандалттай) ажиллуулах шаардлагатай.
- Хуулийн сангийн ingest скриптүүд — өмнөх сешнд тайлбарласнаар мөн адил блоклогдсон.

## 1. Backend/runtime — баталгаажсан бодит stack

`package.json`-оос шууд:
- Next.js 16.3.0 (App Router), React 19.2.8
- Prisma 7.9.1 + `@prisma/adapter-pg` (Postgres, driver adapter загвар — Prisma-ийн шинэ recommended арга)
- NextAuth v5 beta (`auth.config.ts` + `auth.edge.config.ts` — edge middleware-д зориулж тусад нь тохиргоо, стандарт practice)
- ioredis (rate limiting-д ашиглагдаж байгааг баталгаажуулсан: `src/infrastructure/security/rate-limiter.ts`, 5 API route-д хэрэглэгдэж байна)
- AWS S3 SDK (файл хадгалалт, `ServerSideEncryption: AES256` энэ сешнд нэмэгдсэн)
- OpenAI SDK — **цорын ганц** AI provider байсан (энэ сешнд Claude/Anthropic-ийг **fallback provider**-аар нэмсэн, доор 3-т дэлгэрэнгүй)
- `tesseract.js` (OCR), `unpdf` (PDF), `mammoth` (DOCX) — баримт боловсруулалт
- Playwright — зөвхөн шүүхийн decision scraping-д ашиглагддаг (`ingest-shuukh-canary.ts`), тестийн framework биш

**Vector DB, dedicated queue library (BullMQ гэх мэт) байхгүй.** RAG/хайлт нь Prisma/Postgres-ийн built-in query-нд суурилсан (`KnowledgeLegalCorpusRetriever`), мөн тусдаа `tore-legal-data-engine` microservice рүү HTTP-ээр хандах боломжтой (`HttpLegalCorpusRetriever`, `ENGINE_BASE_URL` тохируулсан үед).

## 2. REQUEST FLOW (Legal AI chat жишээгээр)

```
Клиент (browser)
  → src/middleware.ts (auth guard, route protection — 82 мөр)
  → API route (src/app/api/.../route.ts, 27 route нийт)
  → use-case давхарга (src/application/use-cases/... эсвэл
    src/application/ai/legal-ai.service.ts)
  → domain filter → intent engine → prompt builder (src/engine/gateway)
  → corpus retriever (local Prisma эсвэл remote legal-data-engine, эсвэл
    хоёуланг нь — FallbackLegalCorpusRetriever)
  → completion port (OpenAI, эсвэл ANTHROPIC_API_KEY тохируулсан бол
    OpenAI амжилтгүй үед Claude руу fallback — FallbackLegalAiCompletion,
    энэ сешнд нэмэгдсэн)
  → PrismaLegalAiStore (харилцан яриа, citation, usage хадгалах)
  → хариу клиент рүү
```

Энэ бол ports/adapters (hexagonal) архитектур зөв дагагдсан жишээ — `LegalAiService` нь `LegalAiCompletionPort` интерфэйсээс хэтэрхий хамааралгүй, тул шинэ provider нэмэхэд (Claude) core service-ийг өөрчлөх шаардлагагүй байсан нь энэ сешнд шалгагдсан.

## 3. AI FLOW — баталгаажсан гол цэгүүд

- **Citation grounding**: `resolveLegalAuthorities` нь бодит, ажиллаж буй verification pipeline — баталгаагүй эх сурвалж олдохгүй бол `MISSING_LEGAL_SOURCE_MESSAGE` буцаадаг (уран зохиол зохиохгүй — Phase 6-ийн шаардлагатай нийцдэг).
- **Reasoning Engine** (`src/engine/reasoning/`): бодит 7 алхамтай `ReasoningPlan` архитектур байгаа ч `legal-ai.service.ts`-д `citations: [], documents: [], graphNeighbors: []` гэж хоосон дамжуулагддаг тул **одоогоор идэвхгүй** (өмнөх сешнд илэрсэн, энэ сешнд өөрчлөгдөөгүй).
- **Doctrine/Case-Analysis Engine** (`src/engine/doctrine/`): `EmptyCriminalDoctrineFramework` гэх мэт stub-ууд ашиглагдаж байна (өмнөх сешнд илэрсэн).
- **Provider tagging алдаа олж, засав**: `AIUsage`/`AIMessage`-д `provider` талбар үргэлж `"OPENAI"` гэж hardcode хийгдсэн байсан (Prisma schema-д аль хэдийн `enum AIProvider { OPENAI, CLAUDE }` бэлэн байсан ч ашиглагдаагүй байв). Одоо `LegalAiCompletionResult` бодит provider-ээ буцаадаг болсон тул Claude fallback идэвхжвэл зардал/хэрэглээний тайлан (Phase 21/23) үнэн зөв бичигдэнэ.

## 4. DATABASE FLOW

- 53 Prisma model, 92 `@@index` — индексийн хамрах хүрээ нэлээд сайн (Phase 3-ийн "missing indexes" таамаглал энэ repo-д ерөнхийдөө буруу байна).
- **Баталгаажсан бодит алдаа**: `src/generated/prisma`-д schema-тай синк биш байна. `LawyerProfile.position` талбар (`git log`-оор 8d50f94 commit-д нэмэгдсэн) generated client-д алга — 4 typecheck алдаа гаргаж байна (`prisma-lawyer-profile-repository.ts`). **Засвар**: `npx prisma generate` (эсвэл `npm run db:generate`) — гагцхүү энэ орчноос сүлжээ хаалттай тул ажиллуулж чадаагүй. Танай Windows дээр шууд ажиллуулаарай.
- N+1 query хайлтад (`for...of` дотор `await prisma.X.create/update/delete`) зөвхөн **нэг** жишээ олдсон: `prisma-legal-ai-store.ts:createCitations` — citation бүрийг тусад нь `create` хийдэг. Ач холбогдол бага (нэг хариултад ихэвчлэн цөөхөн citation байдаг), гэхдээ `createManyAndReturn` (Prisma 7-д Postgres дээр дэмжигддэг) руу шилжүүлбэл 1 round-trip болгож болно — энэ сешнд **хийгээгүй** (цар хүрээг хязгаарлах үүднээс, учир нь round-trip тоог турших бодит DB орчин байхгүй байсан).

## 5. DEPLOYMENT FLOW

- `.github/workflows/ci.yml`: push/PR болгонд `ubuntu-latest` дээр бодит Postgres-той, `npm ci → npm test → npm run lint → npm run typecheck → production build` бүрэн гүйцэтгэдэг. **Энэ сешнээс commit хийсэн өөрчлөлт CI-гээр бодитоор шалгагдана** — та `git push` хиймэгц.
- Vercel тохиргооны файл (`vercel.json`) олдсонгүй — Vercel Next.js-ийг автоматаар танидаг тул шаардлагагүй байж болно, гэхдээ баталгаажуулаагүй.

## 6. SECURITY BOUNDARIES (баталгаажсан)

- `next.config.ts`: HSTS, CSP, X-Frame-Options: DENY, зэрэг production security header бүрэн.
- bcrypt (cost 12) нууц үг hash хийдэг.
- S3 upload-д `ServerSideEncryption: AES256` (энэ сешний өмнөх ажилд нэмэгдсэн).
- Redis-based rate limiting 5 API route дээр идэвхтэй.
- `AuditLog` Prisma model өргөн ашиглагддаг.

## 7. KNOWN BOTTLENECKS (баталгаажсан, хэмжээгүй)

Илэрсэн боловч **хэмжигдээгүй** (сервер ажиллуулах боломжгүй байсан тул):
1. `LawyerProfile` typecheck алдаа — production build-д саад болох магадлалтай (`prisma generate` дутуу).
2. `createCitations`-ийн N+1 (бага ач холбогдолтой).
3. Хоёр тусдаа хуулийн эх сурвалж систем (`src/engine/knowledge` vs `tore-legal-data-engine`) — өмнөх ажигдалт, гүйцэтгэлд шууд бус нөлөөтэй (хөгжүүлэлт хоёр дахин, эх сурвалжийн зөрүүний эрсдэл).

**Бодит TTFB, DB query timing, bundle size, cold start зэргийг хэмжихийн тулд** дараах аль нэгийг хийх шаардлагатай: (а) танай жинхэнэ Windows орчинд `npm run build && npm start` ажиллуулж, DevTools/Lighthouse-оор хэмжих, эсвэл (б) Vercel Analytics/Speed Insights асаах, эсвэл (в) энэ орчинд сүлжээний зөвшөөрөл өргөтгөх. Энэ сешн эдгээрийн alийг ч хийх боломжгүй байсан тул "гүйцэтгэл X% сайжирлаа" гэсэн ямар ч тоо баримт **зохиогоогүй**.

## 8. Танд хийх шаардлагатай гар алхмууд (network блоклогдсон учир)

1. `git push` — 2 commit push хийгдээгүй хүлээгдэж байна (`c607356`, `5f83067`).
2. `npx prisma generate` (эсвэл `npm run db:generate`) — `LawyerProfile.position` typecheck алдааг засна.
3. `npm test` — vitest энэ орчинд ажиллахгүй байсан (`@rollup/rollup-linux-x64-gnu` native binary дутуу). Танай Windows дээр ажиллах ёстой (CI дээр ч ажилладаг), гэхдээ баталгаажуулаагүй.
