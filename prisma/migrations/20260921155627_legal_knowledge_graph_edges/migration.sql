-- Persisted projection of src/engine/graph onto existing legal-knowledge
-- rows. Edges only — see LegalKnowledgeGraphEdge's doc comment in
-- schema.prisma for why there is no foreign key to LegalKnowledgeDocument.

-- CreateTable
CREATE TABLE "legal_knowledge_graph_edges" (
    "id" TEXT NOT NULL,
    "edge_type" TEXT NOT NULL,
    "from_node_id" TEXT NOT NULL,
    "to_node_id" TEXT NOT NULL,
    "from_document_id" TEXT,
    "to_document_id" TEXT,
    "from_label" TEXT NOT NULL,
    "to_label" TEXT NOT NULL,
    "source_kind" TEXT NOT NULL,
    "evidence" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_knowledge_graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_knowledge_graph_edges_from_node_id_idx" ON "legal_knowledge_graph_edges"("from_node_id");

-- CreateIndex
CREATE INDEX "legal_knowledge_graph_edges_to_node_id_idx" ON "legal_knowledge_graph_edges"("to_node_id");

-- CreateIndex
CREATE INDEX "legal_knowledge_graph_edges_from_document_id_idx" ON "legal_knowledge_graph_edges"("from_document_id");

-- CreateIndex
CREATE INDEX "legal_knowledge_graph_edges_to_document_id_idx" ON "legal_knowledge_graph_edges"("to_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_knowledge_graph_edges_from_node_id_edge_type_to_node__key" ON "legal_knowledge_graph_edges"("from_node_id", "edge_type", "to_node_id");
