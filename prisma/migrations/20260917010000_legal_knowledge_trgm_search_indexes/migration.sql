-- Sprint 14 performance: legal_knowledge_articles/legal_knowledge_chunks
-- search (`buildArticleWhere` / `tokenFieldContains` / `buildChunkTextWhere`
-- in prisma-legal-knowledge-repository.ts) uses Prisma `contains` +
-- `mode: "insensitive"`, which compiles to SQL `ILIKE '%term%'` with a
-- leading wildcard against `text`/`title`/`article_number`. None of those
-- columns had a supporting index, so every open-question and
-- exact-citation search forced a sequential/pattern scan whose cost scales
-- with corpus size (confirmed by the read-only performance audit).
--
-- pg_trgm's gin_trgm_ops operator class supports LIKE/ILIKE (including
-- leading-wildcard `%term%`) directly, so this adds GIN trigram indexes
-- without changing any application query — the existing `contains` /
-- `mode: "insensitive"` Prisma calls are untouched.
--
-- Applied only to the local tore_verification database as part of this
-- audit/implementation. Never run against Neon production from here.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS legal_knowledge_articles_text_trgm_idx
  ON legal_knowledge_articles USING GIN (text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS legal_knowledge_articles_title_trgm_idx
  ON legal_knowledge_articles USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS legal_knowledge_articles_article_number_trgm_idx
  ON legal_knowledge_articles USING GIN (article_number gin_trgm_ops);

CREATE INDEX IF NOT EXISTS legal_knowledge_chunks_text_trgm_idx
  ON legal_knowledge_chunks USING GIN (text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS legal_knowledge_chunks_article_number_trgm_idx
  ON legal_knowledge_chunks USING GIN (article_number gin_trgm_ops);
