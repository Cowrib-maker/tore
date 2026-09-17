# TORE — Хуулийн өгөгдлийн migration зохион байгуулалт

Огноо: 2026-09-10 (шинэчлэгдсэн). Анхны хувилбар зөвхөн загвар байсан; энэ сешнд бодит тоо баталгаажиж, migration script бичигдэж, repo-д commit хийгдсэн (доор §6, §7). Скрипт **ажиллуулаагүй** хэвээр — зөвхөн бэлдэж, dry-run горимоор бэлэн болсон.

## 0. Одоогийн статус (2026-09-10 шинэчлэлт)

`device_bash` энэ сешнд бас тасарсан хэвээр байсан тул шууд SQL query ажиллуулах боломжгүй байсан ч, хэрэглэгч Prisma Studio-г (`npx prisma studio`) хоёр repo-д тус тусад нь өөрийн компьютер дээр биечлэн нээж, **STEP 2-ын бодит тоог баталгаажуулсан** (§6). Үүний үндсэн дээр migration script бэлэн болж, `tore-legal-data-engine/scripts/migrate-legacy-tore-data.ts`-д commit хийгдсэн (§7). Скрипт анхдагч байдлаараа **dry-run** (`--commit` дамжуулаагүй бол юу ч бичихгүй).

## 1. Эх schema (source): `tore` → `LegalKnowledgeDocument`/`Article`/`Chunk`/`LegalSourceArchive`

`prisma/schema.prisma`-аас шинээр уншиж баталгаажуулав:

- `LegalSourceArchive`: `id, connectorId, source, sourceId, lawId, jurisdiction, authority, sourceType, originalUrl, fetchedAt, sha256 (unique), contentSha256 (unique), checksumVerified, mimeType, byteSize, archiveVersion, storageKey, originalFileName, encoding, createdAt`
- `LegalKnowledgeDocument`: `id, sourceId, sourceUrl, lawId, title, kind, language, jurisdiction, documentType, articleCount, chunkCount, contentSha256, archiveId, version, validFrom, validTo, sourceVersion, ingestedAt, createdAt, updatedAt`
- `LegalKnowledgeArticle`: `id, documentId, articleNumber, title, text, order`
- `LegalKnowledgeChunk`: `id, documentId, articleNumber, order, text, tokenEstimate`

**Миний өмнөх (энэ сешнээс өмнөх) тайлбарт байсан алдаа**: тэнд "versioning байхгүй" гэж бичсэн байсан — энэ буруу. `LegalKnowledgeDocument.version`, `.validFrom`, `.validTo` талбарууд бодитоор байгаа, зөвхөн engine талын шиг тусдаа `LegalDocumentVersion` мод биш, нэг мөрөнд хавтгайлсан хувилбар. Энэ мессежинд засав.

## 2. Хүлээн авагч schema (destination): `tore-legal-data-engine`

`prisma/schema.prisma`-аас (өмнөх мессежинд бүрэн уншсан): `LegalSource → LegalDocument → LegalDocumentVersion → LegalNode` мод, `CitationEntry`, `ArchiveRecord`, `IngestJob`, `ParseReview`.

## 3. Талбарын харгалзаа (field mapping)

| `tore` эх | `tore-legal-data-engine` хүлээн авагч | Тэмдэглэл |
|---|---|---|
| `LegalSourceArchive.source` + `.authority` + `.sourceType` | `LegalSource.name/authority/type` | `LegalSource` бүр `@@unique([jurisdiction, type, baseUrl])` тул эх бичиг бүрд биш, **эх сурвалж бүрд нэг удаа** үүсгэнэ (жишээ: "legalinfo.mn — хууль" гэсэн 1 мөр, доор олон баримт холбогдоно) |
| `LegalSourceArchive.sha256/contentSha256/storageKey/originalFileName/byteSize/mimeType/fetchedAt` | `ArchiveRecord.sha256/storageKey/originalFileName/byteSize/mimeType/retrievedAt` | Шууд 1:1 харгалзана. **`sha256` давхацвал (`ArchiveRecord.sha256 @unique`) шинэ мөр биш, байгаа мөрийг дахин ашиглана — энэ нь duplicate-safe шаардлагыг автоматаар хангана** |
| `LegalKnowledgeDocument.title/documentType/jurisdiction` | `LegalDocument.title/documentType/jurisdiction` | `documentType` enum-ийн утгын нэрс өөр (`tore` чөлөөт string, engine `DocumentType` enum) — mapping хүснэгт хэрэгтэй (жиш нь `"law"` → `LAW`) |
| `LegalKnowledgeDocument.sourceUrl` | `LegalDocument.canonicalUrl` | Шууд |
| `LegalKnowledgeDocument.version/validFrom/validTo` | `LegalDocumentVersion.versionNumber/effectiveFrom/effectiveTo` | **Чухал ялгаа**: `tore`-ийн `validFrom/validTo` бол **String (ISO date эсвэл null)**, engine-ийн `effectiveFrom/effectiveTo` бол **DateTime?**. Хөрвүүлэхдээ парс хийхээс өмнө форматыг баталгаажуулах ёстой (буруу парс хийвэл `AS_OF_UNAVAILABLE`-ийн логик буруу ажиллана) |
| `LegalKnowledgeDocument.contentSha256` | `LegalDocumentVersion.contentHash` | Шууд, гэхдээ `@@unique([documentId, contentHash, parserId])` тул `parserId`-г migration script-д тохируулах утга (жиш нь `"tore-legacy-import-v1"`) өгөх ёстой — цаашид жинхэнэ дахин parse хийхээс ялгах боломжтой байхын тулд |
| `LegalKnowledgeArticle.articleNumber/title/text/order` | `LegalNode` мөр бүр (`nodeType: ARTICLE`) | `LegalNode.sourceLocator` талбарт article-ийн тодорхойлогч (жиш нь `"article-5"`) бичих ёстой — engine талд `@@unique([documentVersionId, sourceLocator])` тул давхардал шалгах түлхүүр |
| `LegalKnowledgeChunk` | **Шилжүүлэхгүй** | Chunk бол зөвхөн `tore`-ийн одоогийн retrieval-д зориулсан tokenization illustration — engine-ийн `LegalNode` мод нь өөрөө retrieval-ийн нэгж тул chunk дахин тооцоологдоно, шууд хуулах шаардлагагүй |
| (байхгүй) | `CitationEntry` | `tore` талд citation-ийн бие даасан баталгаажилт байхгүй тул migration-оор шинээр гаргахгүй — engine-ийн citation verification pipeline анх удаа ажиллах үедээ өөрөө үүсгэнэ |

## 4. ID стратеги

`tore`-ийн ID-г **шууд дахин ашиглахгүй** (өөр schema, өөр давхцлын түлхүүр). Оронд нь:
- Migration script-д `sourceLegacyId` гэсэн metadata талбар (`IngestJob.metadata` Json-д, эсвэл шинэ багана) бичиж, `tore`-ийн эх ID-тай холбоо мөрдөх боломжтой байлгах — **auditable** шаардлагыг үүгээр хангана.
- `ArchiveRecord.sha256`-г идэмпотентийн гол түлхүүр болгоно (агуулга ижилхэн бол дахин үүсгэхгүй).

## 5. Migration-ийн урсгал (санал болгож буй, ХАРАХАД ЗОРИУЛАГДСАН — ажиллуулаагүй)

```
1. tore.LegalSourceArchive бүрийг уншина
2. sha256-аар engine.ArchiveRecord-д UPSERT (давхцвал алгасна — idempotent)
3. tore.LegalKnowledgeDocument бүрийг уншина
   → engine.LegalSource-г (jurisdiction, type, baseUrl)-аар find-or-create
   → engine.LegalDocument-г (sourceId, canonicalUrl)-аар find-or-create
   → engine.LegalDocumentVersion-г (documentId, contentHash, parserId="tore-legacy-import-v1")-аар UPSERT
4. tore.LegalKnowledgeArticle бүрийг engine.LegalNode (ARTICLE) болгож хөрвүүлнэ
   → sourceLocator = "article-{articleNumber ?? order}"
   → (documentVersionId, sourceLocator) давхцвал алгасна
5. Ажиллуулсны дараа: tore.count() vs engine.count() тоог харьцуулж тайлан гаргана
6. Зөвхөн тоо таарсны дараа ENGINE_BASE_URL/ENGINE_SERVICE_TOKEN тохируулна
```

**Reversible**: engine талд юу ч устгахгүй, зөвхөн нэмдэг (`create`/`upsert`) тул script-ийг дахин ажиллуулах = аюулгүй. Буцаах шаардлагатай бол зүгээр engine DB-ийн migration-аар нэмэгдсэн мөрүүдийг `sourceLegacyId IS NOT NULL`-аар устгаж болно (`tore` тал огт өөрчлөгдөхгүй тул чинь эх өгөгдөл байнга бүрэн хэвээр).

## 6. STEP 2 — Өгөгдлийн санг шалгах (RESOLVED, 2026-09-10)

Хэрэглэгч Prisma Studio-гоор биечлэн баталгаажуулав:

- **TORE `legal_knowledge_documents` мөрийн тоо: 1003** (Prisma Studio, `localhost:51212`, сүүлийн хуудас 11 of 11 × 100 мөр/хуудас + 3 = 1003). Өмнөх 943/947 (2026-09-09) тайлангаас өссөн — corpus-д шинэ баримт нэмэгдсэн.
- **`tore-legal-data-engine` талын бүх хүснэгт: 0 мөр** (Prisma Studio sidebar-ийн загварын тоогоор баталгаажсан — `LegalDocument: 0`, `LegalSource: 0`, `ArchiveRecord: 0`, бусад бүх загвар мөн 0). Энэ нь §0-д дурдсан "engine бүрэн хоосон" таамаглалыг бүрэн баталсан.
- Legal Data Engine index/search structures — DB хоосон тул холбогдох биш (migration хийгдээгүй бол мод/индекс байхгүй).

Дүгнэлт: migration бол цэвэр **backfill** (0 → 1003), давхардал/зөрчлийн эрсдэл байхгүй тул script-ийг эхлээд бага хэмжээгээр (`--limit 10`) турших нь зохистой.

## 7. Migration script бэлэн боллоо (ажиллуулаагүй)

`tore-legal-data-engine/scripts/migrate-legacy-tore-data.ts` файл энэ сешнд бичигдэж, repo-д шууд commit хийгдсэн (device_bash тасарсан хэвээр байсан тул ажиллуулж/typecheck хийж чадаагүй — зөвхөн код бичсэн, **шалгаагүй**).

Гол зарчим:
- Эх (`tore`) DB-г зөвхөн уншина (`SELECT`, `$queryRawUnsafe`) — бичихгүй.
- Хүлээн авагч (`engine`) DB рүү зөвхөн `upsert`/`create` (устгахгүй) — §3-ийн field mapping-ийг бүрэн дагасан.
- Анхдагч `--commit` дамжуулаагүй бол **dry-run** (юу ч бичихгүй, зөвхөн тайлан хэвлэнэ).
- `--limit N` — эхлээд цөөн мөрөөр турших боломж.
- `sourceLegacyId`-г §4-д дурдсанчлан `EngineAuditLog`-д (`entityType: "LegalDocument"`, `metadata.sourceLegacyId`) бичиж auditable болгосон — schema-д шинэ багана нэмэхгүйгээр.
- `documentType`/`sourceType` mapping хүснэгт нь **таамаг** (жишээ нь тоглогч талын жинхэнэ утгуудыг [1-р screenshot-оос](.) харахад `LAW, CONTRACT, CONSTITUTION, COURT_JUDGMENT, LABOR_LAW` гэх мэт утгууд байгааг ажигласан — эдгээрийг script дотор урьдчилан mapping хийсэн ч, `CONTRACT` төрлийг хуулийн эх сурвалж биш гэж үзэн `OTHER`-т байрлуулсан тул **энэ mapping-ийг ажиллуулахаас өмнө хянах шаардлагатай**).
- `LegalDocument.status` талбарт хуульчийн шалгалт хэрэгтэй — script анхдагчаар `UNKNOWN` тавьдаг (хамгийн аюулгүй сонголт, буруу "хүчинтэй/хүчингүй" мэдээлэл гаргахгүйн тулд).

### 7.1 Бүрэн (1003 баримт) dry-run-аар илэрсэн нэмэлт mapping (2026-09-10)

Дээрх §7-ийн жагсаалт зөвхөн нэг screenshot-оос авсан түүвэр байсан тул бүрэн биш байв. Бүх 1003 баримтаар `--limit`-гүй dry-run ажиллуулахад цэвэр гарсан (`documentsSeen: 1003`, `errors: []`, `dateParseWarnings: []`), гэхдээ 2 шинэ mapping хийгдээгүй утга илэрсэн:

| Эх утга (`tore`) | Талбар | Шийдвэрлэсэн mapping | Үндэслэл |
|---|---|---|---|
| `CRIMINAL_CODE` | `LegalKnowledgeDocument.documentType` | `DocumentType.LAW` | Монгол Улсын Эрүүгийн хууль бол Улсын Их Хуралаас баталсан кодификацчлагдсан хууль — engine-ийн `DocumentType` enum-д тусдаа "code" төрөл байхгүй тул `constitution`/`labor_law`-тай ижил `LAW`-д байрлуулав |
| `judgment` | `LegalSourceArchive.sourceType` | `SourceType.OTHER` | §7-д аль хэдийн тэмдэглэсэн `court_judgment` → `OTHER`-тэй яг ижил шалтгаан: аль шатны шүүхээс гарсныг эх утга нь өөрөө баталгаажуулахгүй тул `SUPREME_COURT`/`CONSTITUTIONAL_COURT`-г таамаглаж оноох нь хуулийн зүйн баталгаагүй мэдэгдэл болно. Баримт тус бүрээр шүүхийн шатыг эх сурвалжаас баталгаажуулсны дараа гараар дэвшүүлж болно |

Скрипт (`scripts/migrate-legacy-tore-data.ts`) шинэчлэгдэж, дээрх хоёр mapping нэмэгдсэн. Бусад бүх зан төлөв (transaction хил, idempotent upsert түлхүүрүүд, эх DB-г зөвхөн унших, dry-run анхдагч горим) өөрчлөгдөөгүй.

**Дараагийн алхам (танаас хэрэгтэй)**:
1. `tore-legal-data-engine/.env`-д `TORE_SOURCE_DATABASE_URL`-г `tore`-ийн `DATABASE_URL`-ийн утгаар нэмэх (зөвхөн уншихад ашиглана).
2. `npx tsx scripts/migrate-legacy-tore-data.ts --limit 10` (dry-run, 10 баримтаар) ажиллуулж, гарсан тайланг (`unmappedDocumentTypes`, `dateParseWarnings`) надад харуулах.
3. Тайлан зөв бол `--limit 10 --commit`-ээр жинхэнэ бага хэмжээний бичилт хийж баталгаажуулах, дараа нь бүрэн `--commit`.
4. Тоо таарсны дараа ENGINE_BASE_URL/ENGINE_SERVICE_TOKEN тохируулах (§5-ын 6-р алхам).

## 8. Бүрэн `--commit` ажилласан (2026-09-10) — 15 article identity зөрчил илэрч, засагдсан

Бүрэн `--commit` хоёр удаа амжилттай ажиллаж (тоо тогтвортой, duplicate ургалт байхгүй):
`legalDocument: 1003`, `legalDocumentVersion: 1003`, боловч эхэндээ `legalNode: 16404` (эх сурвалжийн `16419` article-аас 15 дутуу).

**Үндсэн шалтгаан**: `sourceLocator = article-${article_number ?? order}` томьёо 11 баримтад (жишээ нь ЭРҮҮГИЙН ХУУЛЬ 181/191/221/251/261-р зүйл, МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬ 19-р зүйл гэх мэт) давхцсан — учир нь `legal_knowledge_articles.article_number` нь **зөвхөн индекс, unique constraint биш**. SHA256-аар шалгаж баталгаажуулснаар эдгээр 15 article нь давхардсан текст БИШ, харин **ялгаатай, бодит хуулийн агуулга** байсан (жишээ нь өөр өөр гэмт хэргийн зүйл заалт нэг дугаартай) — иймд `OTHER`-т байрлуулах биш, алдагдсан identity-г сэргээх шаардлагатай гэж дүгнэв.

**Засвар** (`src/domain/services/legacy-article-locator.ts`, шинэ файл): article бүрийг `(order ASC, id ASC)`-ээр детерминистаар эрэмбэлж, нэг баримт дотор `article-N` давхцвал зөвхөн эхнийх нь хуучин локатораа хадгална; бусад нь `article-N__legacyId-<article.id>`-ээр өөрийн гэсэн unique локатортой болно. `article_number`/`title`/`text`/`contentHash` бүгд хэвээрээ хадгалагдана — зөвхөн техник identity (`sourceLocator`) өөрчлөгдөнө, хуулийн citation (`article`/`number` багана) огт хөндөгдөхгүй. Давхцаагүй 16404 article-ийн локатор **өөрчлөгдөхгүй** тул re-run нь зөвхөн 15 шинэ мөр нэмнэ, байгаа өгөгдлийг дахин бичихгүй.

Дэлгэрэнгүй загварын үндэслэл: `docs/architecture/legal-data-identity.md`.
