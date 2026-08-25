import { caseReviewUi as ui } from "@/application/use-cases/case-review/labels";
import {
  blockingElements,
  factsForElement,
  formatValidityPeriod,
  isAuthoritativeRule,
  isManualMethod,
  primaryConclusion,
  relatedHighlightIds,
  reviewErrorState,
  reviewTraceId,
  sourceUnavailable,
  supportingFactIdsForElement,
  type TraceSelection,
} from "@/application/use-cases/case-review/view-model";
import { StatusBadge } from "@/components/case-review/status-badge";
import type { CaseReviewWorkspacePayload } from "@/engine/doctrine";

/**
 * Server-safe snapshot of the review workspace for tests and static rendering.
 * Interactive selection lives in CaseReviewWorkspace.
 */
export function CaseReviewSnapshot({
  payload,
  selectedIssueId = payload.review.issues[0]?.id ?? null,
  selectedElementId = payload.review.elements[0]?.id ?? null,
  selection = payload.review.issues[0]
    ? { kind: "ISSUE", id: payload.review.issues[0].id }
    : null,
}: {
  payload: CaseReviewWorkspacePayload;
  selectedIssueId?: string | null;
  selectedElementId?: string | null;
  selection?: TraceSelection | null;
}) {
  const review = payload.review;
  const highlightIds = relatedHighlightIds(review, selection);
  const conclusion = primaryConclusion(review);
  const errorKey = reviewErrorState(review);
  const facts = factsForElement(review, selectedElementId);
  const blockers = blockingElements(review);
  const on = (kind: Parameters<typeof reviewTraceId>[0], id: string) =>
    highlightIds.has(reviewTraceId(kind, id)) ? "true" : "false";

  return (
    <div data-testid="case-review-snapshot">
      <header data-testid="case-review-header">
        <span data-testid="case-title">{payload.title}</span>
        <span data-testid="case-domain">{payload.domain}</span>
        <span data-testid="case-applicable-at">{payload.applicableAt}</span>
        {payload.analyzedAt ? (
          <span data-testid="case-analyzed-at">{payload.analyzedAt}</span>
        ) : null}
        {payload.lastAnalysisError ? (
          <div data-testid="analysis-failure">{payload.lastAnalysisError}</div>
        ) : null}
        <StatusBadge value={payload.status} />
      </header>
      {errorKey ? <div data-testid={`error-${errorKey}`}>{errorKey}</div> : null}

      <section data-testid="issue-panel">
        {review.issues.map((issue) => (
          <article
            key={issue.id}
            data-testid={`issue-${issue.id}`}
            data-selected={selectedIssueId === issue.id ? "true" : "false"}
            data-highlighted={on("ISSUE", issue.id)}
          >
            <h2>{issue.statement}</h2>
            <span>{issue.kind}</span>
            <StatusBadge value={issue.status ?? payload.status} />
          </article>
        ))}
      </section>

      <section data-testid="rule-panel">
        {review.rules.length === 0 ? <p>{ui.noRuleTitle}</p> : null}
        {review.rules.map((rule) => (
          <article key={rule.id} data-testid={`rule-${rule.id}`}>
            <h3>{rule.title}</h3>
            <span data-testid="article-number">{rule.articleNumber}</span>
            <span>{rule.sourceType}</span>
            <span>{rule.sourceVersion}</span>
            <span>{formatValidityPeriod(rule.validFrom, rule.validTo)}</span>
            <StatusBadge value={rule.supportStatus ?? "UNKNOWN"} />
            {!isAuthoritativeRule(rule) ? (
              <span data-testid="non-authoritative-rule">{ui.notAuthoritative}</span>
            ) : null}
            {sourceUnavailable(rule) ? (
              <span data-testid="unavailable-source">{ui.officialSourceUnavailable}</span>
            ) : (
              <a data-testid="official-source-link" href={rule.officialUrl || rule.sourceUrl || ""}>
                {ui.openOfficialSource}
              </a>
            )}
            <p>{rule.statement}</p>
          </article>
        ))}
      </section>

      <section data-testid="legal-test-panel">
        {review.tests.length === 0 ? <p>{ui.noLegalTestTitle}</p> : null}
        {review.tests.map((test) => (
          <article key={test.id} data-testid={`legal-test-${test.id}`}>
            <StatusBadge value={test.extractionStatus ?? "UNKNOWN"} />
            <span>{test.extractionKind}</span>
            <span>{test.provenance}</span>
          </article>
        ))}
        {review.elements.map((el) => (
          <article
            key={el.id}
            data-testid={`element-${el.id}`}
            data-highlighted={on("ELEMENT", el.id)}
          >
            <span data-testid={`element-ordinal-${el.id}`}>{el.order}</span>
            <p data-testid={`element-source-${el.id}`}>{el.description}</p>
            <StatusBadge value={el.status} />
          </article>
        ))}
      </section>

      <section data-testid="intake-facts-panel">
        {payload.caseFacts.map((fact) => (
          <article key={fact.id} data-testid={`intake-fact-${fact.id}`}>
            <span>{fact.id}</span>
            <span>{fact.sourceType}</span>
            <p>{fact.text}</p>
            <span>{fact.evidenceIds.join(",")}</span>
          </article>
        ))}
      </section>

      <section data-testid="intake-evidence-panel">
        {payload.caseEvidence.map((item) => (
          <article key={item.id} data-testid={`intake-evidence-${item.id}`}>
            <span>{item.id}</span>
            <span>{item.evidenceType}</span>
            <p>{item.title}</p>
            <span>{item.factIds.join(",")}</span>
          </article>
        ))}
      </section>

      <section data-testid="facts-panel">
        {facts.map((fact) => (
          <article key={fact.id} data-testid={`fact-${fact.id}`}>
            <span>{fact.id}</span>
            <p>{fact.statement}</p>
          </article>
        ))}
      </section>

      <section data-testid="mapping-panel">
        {review.mappings.map((mapping) => (
          <article
            key={mapping.id}
            data-testid={`mapping-${mapping.id}`}
            data-method={mapping.method}
            data-manual={isManualMethod(mapping.method) ? "true" : "false"}
          >
            <span>{mapping.factId}</span>
            <span>{mapping.relation}</span>
            <span>{mapping.elementId}</span>
            <span>{mapping.confidence}</span>
            <span>{mapping.method}</span>
            <span>{mapping.evidenceIds.join(",")}</span>
          </article>
        ))}
      </section>

      <section data-testid="subsumption-panel">
        {review.elements.map((el) => (
          <article key={el.id} data-testid={`subsumption-${el.id}`}>
            <p>{el.description}</p>
            <StatusBadge value={el.status} />
            <span>{supportingFactIdsForElement(review, el.id).join(",")}</span>
          </article>
        ))}
      </section>

      <section data-testid="conclusion-panel">
        {conclusion ? (
          <div data-testid="conclusion-disposition">{conclusion.disposition}</div>
        ) : null}
        <p>{conclusion?.statement}</p>
        {blockers.length > 0 ? (
          <ul data-testid="blocking-elements">
            {blockers.map((el) => (
              <li key={el.id}>
                {el.id}:{el.status}:{el.description}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
