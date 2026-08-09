# 15. AI Module Roadmap (Future)

| Field | Value |
|-------|-------|
| Document | AI Module Roadmap |
| Status | Future backlog — **explicitly out of MVP** |
| Earliest consideration | Post–Marketplace launch (after S10+ stabilization) |

---

## 15.1 Position in the platform

```text
TORE Platform
├── Marketplace          ← MVP (Sprints 1–10)
├── Law Firm Workspace   ← future
├── Legal AI             ← this document
└── Shared Platform Kernel
```

Legal AI must be a **separate bounded context**. It must not block or reshape marketplace MVP delivery.

---

## 15.2 Problem framing (future)

Help Mongolian clients and lawyers with **assisted** legal workflows while remaining clear that TORE does **not** provide legal advice as a law firm substitute.

Potential outcomes:

- Faster intake issue summaries  
- Draft question lists for consultations  
- Lawyer-side research assistance  
- Document triage helpers inside future Workspace  

---

## 15.3 Non-negotiable boundaries

| Rule | Rationale |
|------|-----------|
| No AI legal advice claims without counsel review | Regulatory / trust risk |
| Human-in-the-loop for any filing or client-facing opinion | Liability |
| Separate data stores / feature flags | Avoid marketplace schema entanglement |
| Explicit consent & retention policy | Privacy / Mongolian data rules |
| Audit every AI prompt/response metadata | Safety & disputes |
| MN/EN support required | Product market |

---

## 15.4 Suggested phased roadmap (post-MVP)

### Phase A — Foundations

- AI bounded context package/module shell  
- Model provider port (`AiCompletionPort`) — vendor swappable  
- Prompt/version registry  
- Cost & rate limiting  
- Safety classifiers (PII redaction baseline)

### Phase B — Marketplace-adjacent assistants (optional)

- **Intake assistant:** help clients write clearer `issueSummary` before booking  
- **Matching hints:** suggest practice areas from intake text (never auto-assign lawyers without transparency)  
- **FAQ bot:** platform how-to (not legal advice)

### Phase C — Lawyer copilot (Workspace-tied)

- Summarize message threads for a booking (with consent)  
- Draft follow-up checklists  
- Cite uploaded materials with retrieval (RAG) over **lawyer-owned** docs only  

### Phase D — Workspace deep integration

- Matter-aware document Q&A  
- Template drafting with mandatory lawyer edit gate  
- Firm policy packs  

---

## 15.5 Architecture sketch (future)

```text
Presentation (AI UI surfaces)
  → Application (ai use-cases)
    → Domain (AiSession, PromptTemplate policies)
      ← Infrastructure (OpenAI/Azure/local LLM, vector store, object storage)
```

Share only:

- `User` identity  
- Consent records  
- Audit/notification kernel  

Do **not** write AI outputs into `bookings.issue_summary` without explicit user accept.

---

## 15.6 Data & compliance notes

- Store prompts/responses with retention limits  
- Prefer zero-training / no provider data-retention contracts where possible  
- Separate encryption keys for AI artifacts if storing sensitive uploads  
- Legal review before any “advice-like” UX copy  

---

## 15.7 Success metrics (future)

| Metric | Intent |
|--------|--------|
| Intake completion rate | Clients finish booking form faster |
| Lawyer prep time saved | Measured survey / time-on-thread |
| Hallucination incident rate | Safety |
| Cost per assisted session | Unit economics |

---

## 15.8 Explicit MVP instructions

| Do | Do not |
|----|--------|
| Keep this doc as future backlog | Build AI routes/tables in Sprints 2–10 |
| Revisit after marketplace soft launch | Let AI spike steal booking/payments capacity |
| Reuse Kernel ports later | Couple AI to unverified lawyer listings |

---

## 15.9 Decision gate

Legal AI proceeds only after:

1. Marketplace MVP stable in production  
2. Product prioritization vs Workspace  
3. Legal/compliance review of AI claims  
4. Separate implementation plan approval (new docs revision)
