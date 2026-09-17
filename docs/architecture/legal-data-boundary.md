# TORE — Хуулийн өгөгдлийн хилийн шийдвэр (Legal Data Boundary)

Огноо: 2026-09-10. Энэ баримт нь `tore` болон `tore-legal-data-engine` хоёр repo-ийн бодит (таамаглаагүй, шууд уншиж баталгаажуулсан) байдалд үндэслэсэн. Зорилго нь аль нэгийг нь "цэвэрхэн харагдана" гэдэг шалтгаанаар шилжүүлэх биш, **өнөөдөр бодитоор юу ажиллаж байгааг** тодорхойлж, хамгийн эрсдэл багатай замыг сонгох явдал.

## 1. Хамгийн чухал нээлт: хоёр систем бие биетэйгээ ХОЛБОГДООГҮЙ байна

`tore`-ийн `.env`-д `ENGINE_BASE_URL`, `ENGINE_SERVICE_TOKEN` **огт байхгүй**. `src/application/ai/create-legal-ai-service.ts`-ийн `createRemoteCorpusRetriever()` эдгээр хоёр орчны хувьсагч байхгүй үед `UnavailableLegalCorpusRetriever("not_configured")` буцаадаг тул `FallbackLegalCorpusRetriever(local, remote)` нь **100% тохиолдолд `local`** (өөрөөр хэлбэл `tore`-ийн өөрийн `src/engine/knowledge` пайплайнаас Prisma-д ачаалсан 943 баримт бичиг) руу л ордог.

Энэ нь баталгаажсан код-түвшний баримт (тохиргооны байдал), таамаглал биш. Дүгнэлт: **`tore-legal-data-engine` өнөөдөр бодит хэрэглэгчийн нэг ч хүсэлтэд оролцоогүй байна** — хэдий сайн архитектуртай ч гэсэн.

## 2. Хоёр системийн бодит харьцуулалт

| | `tore` (`src/engine/knowledge`) | `tore-legal-data-engine` |
|---|---|---|
| **Статус** | Идэвхтэй ашиглагдаж байгаа, production дата эхийг үйлчилдэг | Барьцгаагаар барьцгаагдсан, **холбогдоогүй** |
| **Дата хэмжээ** | 943/947 баримт бичиг амжилттай (legalinfo.mn, зөвхөн 2/16 категори: хуулийн хууль, үндсэн хууль) | README-ийн Phase 3 тайлбараар анхдагч хязгаар "5 баримт/ажиллуулалт" — бодит ачаалсан хэмжээ батлагдаагүй, харин хамаагүй бага байх магадлалтай |
| **Schema чанар** | `LegalKnowledgeDocument/Article/Chunk` — хавтгай бүтэц, хувилбаржилт (versioning), `effectiveFrom/effectiveTo`, citation-ийн бие даасан `status` талбар зэрэг **байхгүй** | `LegalDocument → LegalDocumentVersion → LegalNode` (parent/child мод), `CitationEntry.status` (VALID/UNRESOLVED/CONFLICT), `IngestJob`, `ParseReview` (хүний review урсгал), `EngineAuditLog` — **архитектурын хувьд хамаагүй боловсронгуй** |
| **Өгөгдлийн сан** | `tore`-ийн үндсэн Neon Postgres дотор (marketplace/users-тэй ижил DB) | Тусдаа Postgres (`tore_legal_data`, docker-compose дотор port 5433) — **PII-гүй, тусгаарлагдсан**, зөв practice |
| **Deploy** | `tore`-ийн Next.js app-тай хамт | Тусдаа Vercel deploy (`vercel.json`, Fastify API) |
| **Scheduled ingestion** | Байхгүй — гар/CLI script (`npm run ingest:legalinfo:*`) | Байхгүй — гар/CLI script (`npm run ingest:legalinfo`), мөн `--allow-full-crawl`-гүйгээр 5 баримтаас хэтрэхгүй |
| **Rate-limit/аюулгүй байдал** | Тодорхойгүй (өмнөх шалгалтаар тусгайлсан config олдоогүй) | Тодорхой: `LEGALINFO_REQUEST_DELAY_MS=4000`, `MAX_CONCURRENCY=1`, `MAX_DOCUMENTS_PER_RUN=5` — маш болгоомжтой тохиргоо |
| **API хил** | Дотоод (шууд Prisma query) | HTTP (`POST /v1/retrieve`, `POST /v1/citations/verify`), service-token-той |

## 3. SOURCE OF TRUTH / INGESTION SERVICE / DATA STORAGE / PUBLIC API / CONSUMER / SYNC STRATEGY

Дараах нь **одоогийн бодит байдалд** үндэслэсэн, стратегийн зорилтот төлөвт хүрэх **шат дараалалтай** зам — нэг мөрөнд бүгдийг сольж болохгүй, учир нь `tore-legal-data-engine`-д одоогоор `tore`-ийн 943 баримтын аль нь ч байхгүй байх магадлалтай.

### Одоогийн бодит байдал (0-р үе шат — өнөөдөр)
- **SOURCE OF TRUTH**: `tore`-ийн Prisma DB доtorh `LegalKnowledgeDocument/Article/Chunk` — учир нь энэ л 100% бодит хүсэлтэд үйлчилж байна.
- **INGESTION SERVICE**: `tore`-ийн `src/engine/knowledge` + root `scripts/ingest-legalinfo-*.ts` (гар ажиллуулдаг).
- **DATA STORAGE**: `tore`-ийн үндсэн Neon Postgres (marketplace-тэй хамт нэг DB-д).
- **PUBLIC API**: Байхгүй — зөвхөн дотоод Prisma query.
- **CONSUMER**: `tore`-ийн Legal AI, Case Review л.
- **SYNC STRATEGY**: Байхгүй (ганц эх сурвалж тул синк хэрэггүй).

### Зорилтот байдал (2-р үе шат — эцсийн)
- **SOURCE OF TRUTH**: `tore-legal-data-engine`-ийн Postgres (`legal_documents`/`legal_document_versions`/`legal_nodes`/`citation_entries`) — зөв versioning, citation-ийн бие даасан баталгаажуулалттай тул удаан хугацаанд илүү найдвартай сан.
- **INGESTION SERVICE**: `tore-legal-data-engine`-ийн workers (`worker:ingest`, `worker:parse`) — `tore`-ийн root `scripts/ingest-legalinfo-*.ts` **татгалзана** (давхардлыг арилгана).
- **DATA STORAGE**: `tore-legal-data-engine`-ийн тусдаа, PII-гүй Postgres.
- **PUBLIC API**: `POST /v1/retrieve`, `POST /v1/citations/verify` (аль хэдийн бий).
- **CONSUMER**: `tore`-ийн `HttpLegalCorpusRetriever` → `LegalDataEngineClient` (аль хэдийн код дотор бий, зөвхөн `ENGINE_BASE_URL`/`ENGINE_SERVICE_TOKEN` тохируулаагүй байгаа).
- **SYNC STRATEGY**: Нэг удаагийн **backfill migration** — `tore`-ийн одоо байгаа 943 баримтыг `tore-legal-data-engine`-ийн schema руу хөрвүүлж импортлох (шинэ crawl биш, учир нь эх сурвалж ижилхэн legalinfo.mn — дахин таталгүйгээр бодит текстээ шилжүүлж болно). Ингэснээр шинэ, илүү сайн schema руу орохдоо 943 баримтаа алдахгүй.

### Шилжилтийн зам (1-р үе шат — одоо хийх ёстой алхмууд, эрэмбээр)
1. `tore-legal-data-engine`-ийг **зогсоохгүй, устгахгүй** — зөв архитектур учраас хадгална.
2. `tore`-ийн 943 баримтыг `tore-legal-data-engine`-ийн schema руу migrate хийх скрипт бичих (өгөгдөл дахин татахгүй, зөвхөн хөрвүүлэлт).
3. Migration амжилттай, тоо баталгаажсаны дараа `ENGINE_BASE_URL`/`ENGINE_SERVICE_TOKEN`-ийг production дээр тохируулж, `FallbackLegalCorpusRetriever`-ийг бодитоор идэвхжүүлэх (энэ мөчид код өөрчлөх шаардлагагүй — аль хэдийн бэлэн).
4. Зөвхөн үүний дараа: `tore`-ийн root `scripts/ingest-legalinfo-*.ts` болон `src/engine/knowledge/crawler`-ийг **deprecated** гэж тэмдэглэж, шинэ ingestion бүгдийг `tore-legal-data-engine`-ээр дамжуулах.
5. Шинэ категори (Улсын дээд шүүхийн тогтоол гэх мэт) нэмэхдээ **зөвхөн** `tore-legal-data-engine` талд нэмнэ — `tore` талд давхар бүү нэм.

## 4. Яагаад шууд нэгтгэхгүй байна вэ (эрсдэлийн үндэслэл)

- Migration-гүйгээр шууд `tore-legal-data-engine`-ийг эх сурвалж болгож сольвол **943 баримт алга болно** — энэ бол хамгийн том эрсдэл, зайлшгүй сэргийлэх ёстой.
- `tore-legal-data-engine`-ийн бодит ачаалсан баримтын тоог батлах боломжгүй байсан (DB-д шууд холбогдож query хийх боломжгүй энэ орчноос) — тул "аль нь илүү" гэдгийг тоо баримтаар batалгаажуулаагүй, зөвхөн архитектурын чанар, README-ийн лавлагаагаар харьцуулав. **Танд хийх зүйл**: `tore-legal-data-engine`-ийн Postgres-д хэдэн `LegalDocument` мөр байгааг өөрөө шалгаж (`npx prisma studio` эсвэл SQL query) надад хэлбэл migration-ийн цар хүрээг тодорхой төлөвлөнө.

## 5. Дараагийн алхам (2026-09-10 шинэчлэлт)

Prisma Studio-гоор хэрэглэгч биечлэн баталгаажуулав: **`tore` = 1003 баримт, `tore-legal-data-engine` = 0** (бүх хүснэгт хоосон). Үүний үндсэн дээр migration script бичигдэж `tore-legal-data-engine/scripts/migrate-legacy-tore-data.ts`-д commit хийгдсэн (дэлгэрэнгүй: `legal-data-migration.md` §6-7). Script анхдагчаар **dry-run**, `--commit` дамжуулаагүй бол юу ч бичихгүй — `device_bash` энэ сешнд ч тасарсан хэвээр байсан тул ажиллуулж/шалгаж чадаагүй. Дараагийн алхам: хэрэглэгч өөрийн компьютерээс `--limit 10` (dry-run)-ээр туршиж, гарсан тайланг харуулах.
