"use client";

import { useActionState, useMemo, useState } from "react";

import {
  caseIntakeAction,
  rerunCaseAnalysisAction,
  submitManualMappingAction,
  updateCaseTitleAction,
  type CaseReviewActionState,
} from "@/application/actions/case-review.actions";
import {
  TRACE_KINDS,
  blockingElements,
  evidenceForFact,
  evidenceIdsForElement,
  factsForElement,
  formatValidityPeriod,
  isAuthoritativeRule,
  isManualMethod,
  negatingFactIdsForElement,
  primaryConclusion,
  relatedHighlightIds,
  reviewErrorState,
  reviewTraceId,
  sourceUnavailable,
  supportingFactIdsForElement,
  unresolvedNotesForElement,
  type TraceKind,
  type TraceSelection,
} from "@/application/use-cases/case-review/view-model";
import {
  analysisStatusLabelMn,
  legalDomainLabelMn,
} from "@/application/use-cases/case-review/labels";
import { highlightedClass, StatusBadge } from "@/components/case-review/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CaseAnalysisReview, CaseReviewWorkspacePayload } from "@/engine/doctrine";
import { FactElementRelation } from "@/engine/doctrine";
import {
  CaseEvidenceType,
  CaseFactSourceType,
} from "@/domain/entities/case-file";
import { cn } from "@/lib/utils";
import type {
  CaseActivityItem,
  CaseConversationSummary,
  CaseDocumentView,
} from "@/application/use-cases/case-review";
import { CaseWorkspaceHome } from "@/components/case-review/case-workspace-home";

type Props = {
  payload: CaseReviewWorkspacePayload;
  createdAt: string;
  conversations: CaseConversationSummary[];
  documents: CaseDocumentView[];
  activity: CaseActivityItem[];
};

function Panel({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <Card size="sm" data-testid={testId} className="gap-3">
      <CardHeader className="border-b pb-3">
        <CardTitle className="font-mono text-xs tracking-wide uppercase text-brand-muted">
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

export function CaseReviewWorkspace({
  payload: initial,
  createdAt,
  conversations,
  documents,
  activity,
}: Props) {
  const [mapState, formAction, pending] = useActionState(
    submitManualMappingAction,
    {} as CaseReviewActionState,
  );
  const [rerunState, rerunAction, rerunPending] = useActionState(
    rerunCaseAnalysisAction,
    {} as CaseReviewActionState,
  );
  const [intakeState, intakeAction, intakePending] = useActionState(
    caseIntakeAction,
    {} as CaseReviewActionState,
  );
  const [titleState, titleAction, titlePending] = useActionState(
    updateCaseTitleAction,
    {} as CaseReviewActionState,
  );
  const payload = [
    intakeState.payload,
    rerunState.payload,
    mapState.payload,
    titleState.payload,
    initial,
  ]
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .sort((a, b) => b.version - a.version)[0]!;
  const review = payload.review;

  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(
    review.issues[0]?.id ?? null,
  );
  const [selectedElementId, setSelectedElementId] = useState<string | null>(
    review.elements[0]?.id ?? null,
  );
  const [selection, setSelection] = useState<TraceSelection | null>(
    review.issues[0]
      ? { kind: "ISSUE", id: review.issues[0].id }
      : null,
  );

  const highlightIds = useMemo(
    () => relatedHighlightIds(review, selection),
    [review, selection],
  );

  const errorKey = reviewErrorState(review);
  const conclusion = primaryConclusion(review);
  const blockers = blockingElements(review);
  const selectedFacts = factsForElement(review, selectedElementId);

  function selectTrace(kind: TraceKind, id: string) {
    setSelection({ kind, id });
    if (kind === "ISSUE") setSelectedIssueId(id);
    if (kind === "ELEMENT" || kind === "SUBSUMPTION") setSelectedElementId(id);
  }

  function isOn(kind: TraceKind, id: string): boolean {
    return highlightIds.has(reviewTraceId(kind, id));
  }

  return (
    <div className="space-y-8" data-testid="case-review-workspace">
      <CaseWorkspaceHome
        payload={payload}
        createdAt={createdAt}
        conversations={conversations}
        documents={documents}
        activity={activity}
        titleAction={titleAction}
        titlePending={titlePending}
        titleError={titleState.error}
        titleSuccess={titleState.success}
      />

      <section id="case-analysis" className="space-y-4 scroll-mt-6">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-[#0A0F14] uppercase">
            Хэрэг шинжлэх
          </h2>
          <p className="mt-1 text-sm text-[#5C6570]">
            Баримт, холбоос болон шинжилгээний үр дүн энд харагдана. AI ярианаас тусдаа.
          </p>
        </div>
      <header
        data-testid="case-review-header"
        className="ds-surface grid gap-2 rounded-xl px-4 py-3 sm:grid-cols-5"
      >
        <HeaderField label="Хэрэг" value={payload.title} />
        <HeaderField label="Эрх зүйн салбар" value={legalDomainLabelMn(payload.domain)} />
        <HeaderField
          label="Шинжилсэн огноо"
          value={
            payload.analyzedAt
              ? payload.analyzedAt.slice(0, 19).replace("T", " ")
              : "—"
          }
        />
        <HeaderField label="Хэрэглэх огноо" value={payload.applicableAt} />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-brand-muted">
            Шинжилгээний төлөв
          </p>
          <p className="mt-1 text-sm font-medium">{analysisStatusLabelMn(payload.status)}</p>
        </div>
      </header>

      {payload.lastAnalysisError ? (
        <div
          data-testid="analysis-failure"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="status"
        >
          {payload.lastAnalysisError} Өмнөх шинжилгээ хадгалагдана.
        </div>
      ) : null}

      {errorKey ? (
        <div
          data-testid={`error-${errorKey}`}
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="status"
        >
          {errorBanner(errorKey, conclusion?.statement)}
        </div>
      ) : null}

      <IntakePanels
        payload={payload}
        formAction={intakeAction}
        pending={intakePending}
        error={intakeState.error}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)_minmax(18rem,1fr)]">
        <Panel
          title="Issues"
          description="Select an issue to highlight its reasoning trace."
          testId="issue-panel"
        >
          {review.issues.length === 0 ? (
            <EmptyState title="No issues" description="The review contains no legal issues." />
          ) : (
            <ul className="space-y-2">
              {review.issues.map((issue) => (
                <li key={issue.id}>
                  <button
                    type="button"
                    data-testid={`issue-${issue.id}`}
                    data-highlighted={isOn("ISSUE", issue.id) ? "true" : "false"}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-sm",
                      selectedIssueId === issue.id
                        ? "border-brand bg-brand-subtle"
                        : "border-border hover:bg-muted/60",
                      highlightedClass(isOn("ISSUE", issue.id)),
                    )}
                    onClick={() => selectTrace("ISSUE", issue.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{issue.statement}</p>
                      <StatusBadge value={issue.status ?? payload.status} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-brand-muted">
                      {issue.kind ?? "unclassified"} · {issue.domain}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <RulePanel
            review={review}
            isOn={isOn}
            onSelect={(id) => selectTrace("RULE", id)}
          />
          <LegalTestPanel
            review={review}
            selectedElementId={selectedElementId}
            isOn={isOn}
            onSelectTest={(id) => selectTrace("LEGAL_TEST", id)}
            onSelectElement={(id) => selectTrace("ELEMENT", id)}
          />
        </div>

        <Panel
          title="Mapped facts"
          description={
            selectedElementId
              ? `Engine facts mapped to ${selectedElementId}`
              : "Facts from the last successful analysis"
          }
          testId="facts-panel"
        >
          {selectedFacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No facts mapped to the selected element.
            </p>
          ) : (
            <ul className="space-y-2">
              {selectedFacts.map((fact) => (
                <li
                  key={fact.id}
                  data-testid={`fact-${fact.id}`}
                  data-highlighted={isOn("FACT", fact.id) ? "true" : "false"}
                  className={cn(
                    "rounded-lg border border-border px-3 py-2 text-sm",
                    highlightedClass(isOn("FACT", fact.id)),
                  )}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => selectTrace("FACT", fact.id)}
                  >
                    <p className="font-mono text-[11px] text-brand-muted">{fact.id}</p>
                    <p>{fact.statement}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Evidence:{" "}
                      {evidenceForFact(review, fact.id)
                        .map((e) => e.id)
                        .join(", ") || "none"}
                      {fact.disputed ? " · disputed" : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <MappingPanel
        review={review}
        isOn={isOn}
        onSelect={(id) => selectTrace("MAPPING", id)}
      />

      <SubsumptionPanel
        review={review}
        isOn={isOn}
        onSelect={(id) => selectTrace("SUBSUMPTION", id)}
      />

      <ConclusionPanel conclusion={conclusion} blockers={blockers} isOn={isOn} />

      <TraceView
        review={review}
        selection={selection}
        isOn={isOn}
        onSelect={selectTrace}
      />

      <ManualMappingForm
        payload={payload}
        review={review}
        formAction={formAction}
        pending={pending}
        error={mapState.error}
      />
      <RerunForm
        payload={payload}
        formAction={rerunAction}
        pending={rerunPending}
        error={rerunState.error}
      />
      </section>
    </div>
  );
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-brand-muted">
        {label}
      </p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function errorBanner(key: string, statement?: string): string {
  switch (key) {
    case "no-issues":
      return "No legal issues were identified. Uncertainty is preserved.";
    case "no-rule":
      return "No retrieved rule. An unsupported proposition is not shown as authority.";
    case "no-legal-test":
      return "No LegalTest was extracted from the source article.";
    case "insufficient-facts":
      return statement ?? "Insufficient facts for required elements.";
    case "conflicting-authority":
      return statement ?? "Conflicting authority blocks a supported conclusion.";
    case "malformed":
      return "The review payload is malformed and cannot be displayed as authority.";
    default:
      return statement ?? key;
  }
}

function RulePanel({
  review,
  isOn,
  onSelect,
}: {
  review: CaseAnalysisReview;
  isOn: (kind: TraceKind, id: string) => boolean;
  onSelect: (id: string) => void;
}) {
  if (review.rules.length === 0) {
    return (
      <Panel title="Rule / Article" testId="rule-panel">
        <EmptyState
          title="No retrieved rule"
          description="Nothing is displayed as authoritative positive law."
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Rule / Article"
      description="Authoritative source metadata. Source text is not paraphrased."
      testId="rule-panel"
    >
      <ul className="space-y-3">
        {review.rules.map((rule) => {
          const official = rule.officialUrl || rule.sourceUrl;
          const authoritative = isAuthoritativeRule(rule);
          return (
            <li
              key={rule.id}
              data-testid={`rule-${rule.id}`}
              data-highlighted={isOn("RULE", rule.id) ? "true" : "false"}
              className={cn(
                "space-y-2 rounded-lg border px-3 py-2",
                authoritative ? "border-border" : "border-destructive/40",
                highlightedClass(isOn("RULE", rule.id)),
              )}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onSelect(rule.id)}
              >
                <p className="font-medium">
                  {rule.title ?? "Untitled legal document"}
                </p>
                <dl className="mt-2 grid gap-1 text-[12px] sm:grid-cols-2">
                  <div>
                    <dt className="text-brand-muted">Article</dt>
                    <dd className="font-mono">{rule.articleNumber ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-muted">Source type</dt>
                    <dd>{rule.sourceType ?? "unknown"}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-muted">Source version</dt>
                    <dd className="font-mono">{rule.sourceVersion ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-brand-muted">Validity</dt>
                    <dd>{formatValidityPeriod(rule.validFrom, rule.validTo)}</dd>
                  </div>
                </dl>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={rule.supportStatus ?? "UNKNOWN"} />
                {rule.confidence != null ? (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    confidence {rule.confidence.toFixed(2)}
                  </span>
                ) : null}
                {!authoritative ? (
                  <span
                    data-testid="non-authoritative-rule"
                    className="text-[11px] text-destructive"
                  >
                    Not displayed as authoritative.
                  </span>
                ) : null}
                {sourceUnavailable(rule) ? (
                  <span data-testid="unavailable-source" className="text-[11px] text-destructive">
                    Official source unavailable
                  </span>
                ) : (
                  <a
                    href={official ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="official-source-link"
                    className="text-[12px] font-medium text-brand underline underline-offset-4"
                  >
                    Open official source
                  </a>
                )}
              </div>
              <p className="border-t pt-2 text-sm whitespace-pre-wrap">{rule.statement}</p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function LegalTestPanel({
  review,
  selectedElementId,
  isOn,
  onSelectTest,
  onSelectElement,
}: {
  review: CaseAnalysisReview;
  selectedElementId: string | null;
  isOn: (kind: TraceKind, id: string) => boolean;
  onSelectTest: (id: string) => void;
  onSelectElement: (id: string) => void;
}) {
  if (review.tests.length === 0) {
    return (
      <Panel title="Legal test" testId="legal-test-panel">
        <EmptyState
          title="No LegalTest"
          description="No source-grounded test was extracted."
        />
      </Panel>
    );
  }

  return (
    <Panel title="Legal test" testId="legal-test-panel">
      {review.tests.map((test) => (
        <div
          key={test.id}
          data-testid={`legal-test-${test.id}`}
          data-highlighted={isOn("LEGAL_TEST", test.id) ? "true" : "false"}
          className={cn("space-y-3", highlightedClass(isOn("LEGAL_TEST", test.id)))}
        >
          <button type="button" className="text-left" onClick={() => onSelectTest(test.id)}>
            <p className="font-medium">{test.name}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <StatusBadge value={test.extractionStatus ?? "UNKNOWN"} />
              <StatusBadge value={test.extractionKind ?? "NONE"} />
            </div>
            {test.provenance ? (
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {test.provenance}
              </p>
            ) : null}
          </button>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>sourceText</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {review.elements.map((el) => (
                <TableRow
                  key={el.id}
                  data-testid={`element-${el.id}`}
                  data-highlighted={isOn("ELEMENT", el.id) ? "true" : "false"}
                  data-state={selectedElementId === el.id ? "selected" : undefined}
                  className={cn(
                    "cursor-pointer",
                    highlightedClass(isOn("ELEMENT", el.id)),
                  )}
                  onClick={() => onSelectElement(el.id)}
                >
                  <TableCell className="font-mono">{el.order}</TableCell>
                  <TableCell>
                    <p className="whitespace-pre-wrap">{el.description}</p>
                    {el.required ? (
                      <span className="text-[11px] text-brand-muted">required</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">optional</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={el.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </Panel>
  );
}

function MappingPanel({
  review,
  isOn,
  onSelect,
}: {
  review: CaseAnalysisReview;
  isOn: (kind: TraceKind, id: string) => boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Panel
      title="Fact → Element mapping"
      description="EXPLICIT and LEXICAL mappings are read-only. MANUAL mappings are visually distinct."
      testId="mapping-panel"
    >
      {review.mappings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fact–element mappings.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fact</TableHead>
              <TableHead>Relation</TableHead>
              <TableHead>Element</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Evidence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {review.mappings.map((mapping) => (
              <TableRow
                key={mapping.id}
                data-testid={`mapping-${mapping.id}`}
                data-method={mapping.method}
                data-highlighted={isOn("MAPPING", mapping.id) ? "true" : "false"}
                className={cn(
                  "cursor-pointer",
                  isManualMethod(mapping.method) &&
                    "border-l-4 border-l-brand bg-brand-subtle/60",
                  highlightedClass(isOn("MAPPING", mapping.id)),
                )}
                onClick={() => onSelect(mapping.id)}
              >
                <TableCell className="font-mono text-xs">{mapping.factId}</TableCell>
                <TableCell>
                  <StatusBadge value={mapping.relation} />
                </TableCell>
                <TableCell className="font-mono text-xs">{mapping.elementId}</TableCell>
                <TableCell>{mapping.confidence}</TableCell>
                <TableCell>
                  <StatusBadge value={mapping.method} />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {mapping.evidenceIds.join(", ") || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}

function SubsumptionPanel({
  review,
  isOn,
  onSelect,
}: {
  review: CaseAnalysisReview;
  isOn: (kind: TraceKind, id: string) => boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <Panel title="Subsumption" testId="subsumption-panel">
      {review.elements.length === 0 ? (
        <p className="text-sm text-muted-foreground">No elements to subsume.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {review.elements.map((el) => (
            <button
              key={el.id}
              type="button"
              data-testid={`subsumption-${el.id}`}
              data-highlighted={isOn("SUBSUMPTION", el.id) ? "true" : "false"}
              className={cn(
                "rounded-lg border border-border px-3 py-2 text-left text-sm",
                highlightedClass(isOn("SUBSUMPTION", el.id)),
              )}
              onClick={() => onSelect(el.id)}
            >
              <p className="font-mono text-[11px] text-brand-muted">
                ELEMENT {el.order}
              </p>
              <p className="whitespace-pre-wrap">{el.description}</p>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge value={el.status} />
                <span className="text-[11px] text-muted-foreground">
                  {el.required ? "required" : "optional"}
                </span>
              </div>
              <dl className="mt-2 space-y-1 font-mono text-[11px]">
                <div>
                  <dt className="text-brand-muted">Supporting facts</dt>
                  <dd>
                    {supportingFactIdsForElement(review, el.id).join(", ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Negating facts</dt>
                  <dd>
                    {negatingFactIdsForElement(review, el.id).join(", ") || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Evidence</dt>
                  <dd>{evidenceIdsForElement(review, el.id).join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt className="text-brand-muted">Unresolved</dt>
                  <dd className="whitespace-pre-wrap font-sans">
                    {unresolvedNotesForElement(review, el.id).join(" ") || "none"}
                  </dd>
                </div>
              </dl>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ConclusionPanel({
  conclusion,
  blockers,
  isOn,
}: {
  conclusion: CaseAnalysisReview["conclusions"][number] | null;
  blockers: CaseAnalysisReview["elements"];
  isOn: (kind: TraceKind, id: string) => boolean;
}) {
  if (!conclusion) {
    return (
      <Panel title="Conclusion" testId="conclusion-panel">
        <EmptyState title="No backend conclusion" />
      </Panel>
    );
  }

  return (
    <Panel
      title="Conclusion"
      description="Rendered from the engine. This screen does not recalculate the disposition."
      testId="conclusion-panel"
    >
      <div
        data-testid="conclusion-disposition"
        data-highlighted={
          isOn("CONCLUSION", conclusion.disposition) ? "true" : "false"
        }
        className={highlightedClass(isOn("CONCLUSION", conclusion.disposition))}
      >
        <StatusBadge value={conclusion.disposition} />
        <p className="mt-2 text-sm">{conclusion.statement}</p>
      </div>
      {conclusion.disposition !== "SUPPORTED" && blockers.length > 0 ? (
        <div data-testid="blocking-elements" className="rounded-md bg-muted/60 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-muted">
            Blocking elements
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {blockers.map((el) => (
              <li key={el.id}>
                <span className="font-mono text-[11px]">{el.id}</span>{" "}
                <StatusBadge value={el.status} />
                <span className="ml-2 whitespace-pre-wrap">{el.description}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

function TraceView({
  review,
  selection,
  isOn,
  onSelect,
}: {
  review: CaseAnalysisReview;
  selection: TraceSelection | null;
  isOn: (kind: TraceKind, id: string) => boolean;
  onSelect: (kind: TraceKind, id: string) => void;
}) {
  const nodeId = (kind: TraceKind): string => {
    switch (kind) {
      case "ISSUE":
        return review.issues[0]?.id ?? "";
      case "RULE":
        return review.rules[0]?.id ?? "";
      case "ARTICLE":
        return review.rules[0]?.articleId ?? review.rules[0]?.id ?? "";
      case "LEGAL_TEST":
        return review.tests[0]?.id ?? "";
      case "ELEMENT":
        return review.elements[0]?.id ?? "";
      case "FACT":
        return review.facts[0]?.id ?? "";
      case "EVIDENCE":
        return review.evidence[0]?.id ?? "";
      case "MAPPING":
        return review.mappings[0]?.id ?? "";
      case "SUBSUMPTION":
        return review.elements[0]?.id ?? "";
      case "CONCLUSION":
        return primaryConclusion(review)?.disposition ?? "";
    }
  };

  return (
    <details className="ds-surface rounded-xl px-4 py-3" data-testid="trace-view">
      <summary className="cursor-pointer text-sm font-medium">
        Reasoning trace
      </summary>
      <ol className="mt-3 space-y-1">
        {TRACE_KINDS.map((kind) => {
          const id = nodeId(kind);
          const active = Boolean(id) && isOn(kind, id);
          return (
            <li key={kind} className="flex flex-col items-start">
              <button
                type="button"
                data-testid={`trace-node-${kind}`}
                data-highlighted={active ? "true" : "false"}
                disabled={!id}
                className={cn(
                  "rounded px-2 py-1 font-mono text-xs",
                  selection?.kind === kind && "font-semibold",
                  highlightedClass(active),
                  !id && "opacity-40",
                )}
                onClick={() => id && onSelect(kind, id)}
              >
                {kind}
                {id ? ` · ${id}` : " · unavailable"}
              </button>
              {kind !== "CONCLUSION" ? (
                <span className="ml-4 text-muted-foreground" aria-hidden>
                  ↓
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </details>
  );
}

const fieldClassName =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function IntakePanels({
  payload,
  formAction,
  pending,
  error,
}: {
  payload: CaseReviewWorkspacePayload;
  formAction: (payload: FormData) => void;
  pending: boolean;
  error?: string;
}) {
  const evidenceById = new Map(
    payload.caseEvidence.map((item) => [item.id, item]),
  );
  const factsById = new Map(payload.caseFacts.map((fact) => [fact.id, fact]));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel
        title="Facts"
        description="Recorded case facts. Adding a fact does not generate a legal conclusion."
        testId="intake-facts-panel"
      >
        <form
          action={formAction}
          className="space-y-2 rounded-lg border border-dashed border-border p-3"
        >
          <input type="hidden" name="caseId" value={payload.caseId} />
          <input
            type="hidden"
            name="expectedVersion"
            value={String(payload.version)}
          />
          <input type="hidden" name="intent" value="create-fact" />
          <Label htmlFor="new-fact-text">Add fact</Label>
          <textarea
            id="new-fact-text"
            name="text"
            required
            rows={3}
            className={fieldClassName}
            placeholder="What happened, in the lawyer's words"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="new-fact-source">Source type</Label>
              <NativeSelect
                id="new-fact-source"
                name="sourceType"
                defaultValue={CaseFactSourceType.MANUAL}
              >
                {Object.values(CaseFactSourceType).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-fact-ref">Source reference (optional)</Label>
              <Input
                id="new-fact-ref"
                name="sourceReference"
                placeholder="Exhibit or note id"
              />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Add fact"}
          </Button>
        </form>

        {payload.caseFacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No facts recorded yet.</p>
        ) : (
          <ul className="space-y-3">
            {payload.caseFacts.map((fact) => (
              <li
                key={`${fact.id}:${payload.version}`}
                data-testid={`intake-fact-${fact.id}`}
                className="space-y-2 rounded-lg border border-border p-3"
              >
                <p className="font-mono text-[11px] text-brand-muted">
                  {fact.id} · {fact.sourceType}
                </p>
                <form action={formAction} className="space-y-2">
                  <input type="hidden" name="caseId" value={payload.caseId} />
                  <input
                    type="hidden"
                    name="expectedVersion"
                    value={String(payload.version)}
                  />
                  <input type="hidden" name="intent" value="update-fact" />
                  <input type="hidden" name="factId" value={fact.id} />
                  <textarea
                    name="text"
                    required
                    rows={3}
                    defaultValue={fact.text}
                    className={fieldClassName}
                    aria-label={`Edit fact ${fact.id}`}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <NativeSelect
                      name="sourceType"
                      defaultValue={fact.sourceType}
                      aria-label={`Source type for ${fact.id}`}
                    >
                      {Object.values(CaseFactSourceType).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </NativeSelect>
                    <Input
                      name="sourceReference"
                      defaultValue={fact.sourceReference ?? ""}
                      placeholder="Source reference"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="xs" disabled={pending}>
                      Save fact
                    </Button>
                  </div>
                </form>
                <form action={formAction}>
                  <input type="hidden" name="caseId" value={payload.caseId} />
                  <input
                    type="hidden"
                    name="expectedVersion"
                    value={String(payload.version)}
                  />
                  <input type="hidden" name="intent" value="delete-fact" />
                  <input type="hidden" name="factId" value={fact.id} />
                  <Button
                    type="submit"
                    variant="destructive"
                    size="xs"
                    disabled={pending}
                  >
                    Delete fact
                  </Button>
                </form>
                <p className="text-[11px] text-muted-foreground">
                  Linked evidence:{" "}
                  {fact.evidenceIds.length === 0
                    ? "none"
                    : fact.evidenceIds
                        .map(
                          (id) => evidenceById.get(id)?.title ?? id,
                        )
                        .join(", ")}
                </p>
                {fact.evidenceIds.map((evidenceId) => (
                  <form
                    key={evidenceId}
                    action={formAction}
                    className="inline-flex"
                  >
                    <input type="hidden" name="caseId" value={payload.caseId} />
                    <input
                      type="hidden"
                      name="expectedVersion"
                      value={String(payload.version)}
                    />
                    <input type="hidden" name="intent" value="unlink" />
                    <input type="hidden" name="factId" value={fact.id} />
                    <input type="hidden" name="evidenceId" value={evidenceId} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="xs"
                      disabled={pending}
                    >
                      Unlink {evidenceById.get(evidenceId)?.title ?? evidenceId}
                    </Button>
                  </form>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Evidence"
        description="Exhibit metadata only. File upload is not available yet. Recording an exhibit does not establish authenticity or admissibility."
        testId="intake-evidence-panel"
      >
        <form
          action={formAction}
          className="space-y-2 rounded-lg border border-dashed border-border p-3"
        >
          <input type="hidden" name="caseId" value={payload.caseId} />
          <input
            type="hidden"
            name="expectedVersion"
            value={String(payload.version)}
          />
          <input type="hidden" name="intent" value="create-evidence" />
          <Label htmlFor="new-evidence-title">Add evidence</Label>
          <Input
            id="new-evidence-title"
            name="title"
            required
            placeholder="Title"
          />
          <textarea
            name="description"
            rows={2}
            className={fieldClassName}
            placeholder="Description (optional)"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <NativeSelect
              name="evidenceType"
              defaultValue={CaseEvidenceType.DOCUMENT}
              aria-label="Evidence type"
            >
              {Object.values(CaseEvidenceType).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </NativeSelect>
            <Input
              name="sourceReference"
              placeholder="Source reference (optional)"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Add evidence"}
          </Button>
        </form>

        {payload.caseEvidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No evidence recorded yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {payload.caseEvidence.map((item) => (
              <li
                key={`${item.id}:${payload.version}`}
                data-testid={`intake-evidence-${item.id}`}
                className="space-y-2 rounded-lg border border-border p-3"
              >
                <p className="font-mono text-[11px] text-brand-muted">
                  {item.id} · {item.evidenceType}
                </p>
                <form action={formAction} className="space-y-2">
                  <input type="hidden" name="caseId" value={payload.caseId} />
                  <input
                    type="hidden"
                    name="expectedVersion"
                    value={String(payload.version)}
                  />
                  <input type="hidden" name="intent" value="update-evidence" />
                  <input type="hidden" name="evidenceId" value={item.id} />
                  <Input name="title" required defaultValue={item.title} />
                  <textarea
                    name="description"
                    rows={2}
                    className={fieldClassName}
                    defaultValue={item.description ?? ""}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <NativeSelect
                      name="evidenceType"
                      defaultValue={item.evidenceType}
                    >
                      {Object.values(CaseEvidenceType).map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </NativeSelect>
                    <Input
                      name="sourceReference"
                      defaultValue={item.sourceReference ?? ""}
                      placeholder="Source reference"
                    />
                  </div>
                  <Button type="submit" size="xs" disabled={pending}>
                    Save evidence
                  </Button>
                </form>
                <form action={formAction}>
                  <input type="hidden" name="caseId" value={payload.caseId} />
                  <input
                    type="hidden"
                    name="expectedVersion"
                    value={String(payload.version)}
                  />
                  <input type="hidden" name="intent" value="delete-evidence" />
                  <input type="hidden" name="evidenceId" value={item.id} />
                  <Button
                    type="submit"
                    variant="destructive"
                    size="xs"
                    disabled={pending}
                  >
                    Delete evidence
                  </Button>
                </form>
                <p className="text-[11px] text-muted-foreground">
                  Linked facts:{" "}
                  {item.factIds.length === 0
                    ? "none"
                    : item.factIds
                        .map((id) => factsById.get(id)?.text.slice(0, 40) ?? id)
                        .join("; ")}
                </p>
              </li>
            ))}
          </ul>
        )}

        {payload.caseFacts.length > 0 && payload.caseEvidence.length > 0 ? (
          <form
            action={formAction}
            className="grid gap-2 rounded-lg border border-dashed border-border p-3 sm:grid-cols-3"
          >
            <input type="hidden" name="caseId" value={payload.caseId} />
            <input
              type="hidden"
              name="expectedVersion"
              value={String(payload.version)}
            />
            <input type="hidden" name="intent" value="link" />
            <NativeSelect name="factId" required defaultValue="">
              <option value="" disabled>
                Select fact
              </option>
              {payload.caseFacts.map((fact) => (
                <option key={fact.id} value={fact.id}>
                  {fact.id}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="evidenceId" required defaultValue="">
              <option value="" disabled>
                Select evidence
              </option>
              {payload.caseEvidence.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" size="sm" disabled={pending}>
              Link evidence to fact
            </Button>
          </form>
        ) : null}
      </Panel>
      {error ? (
        <p
          data-testid="intake-error"
          className="text-sm text-destructive lg:col-span-2"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ManualMappingForm({
  payload,
  review,
  formAction,
  pending,
  error,
}: {
  payload: CaseReviewWorkspacePayload;
  review: CaseAnalysisReview;
  formAction: (payload: FormData) => void;
  pending: boolean;
  error?: string;
}) {
  const mappingFacts =
    payload.caseFacts.length > 0 ? payload.caseFacts : review.facts;
  const canMap = mappingFacts.length > 0 && review.elements.length > 0;

  return (
    <Panel
      title="Manual mapping"
      description="Saves a MANUAL mapping and re-runs the existing engine. Does not edit the conclusion locally."
      testId="manual-mapping-form"
    >
      {!canMap ? (
        <p className="text-sm text-muted-foreground">
          Manual mapping requires at least one fact and one LegalTest element.
        </p>
      ) : (
        <form action={formAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="caseId" value={payload.caseId} />
          <input type="hidden" name="expectedVersion" value={String(payload.version)} />
          <div className="space-y-1">
            <Label htmlFor="factId">Fact</Label>
            <NativeSelect id="factId" name="factId" required defaultValue="">
              <option value="" disabled>
                Select fact
              </option>
              {mappingFacts.map((fact) => (
                <option key={fact.id} value={fact.id}>
                  {fact.id}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="elementId">Element</Label>
            <NativeSelect id="elementId" name="elementId" required defaultValue="">
              <option value="" disabled>
                Select element
              </option>
              {review.elements.map((el) => (
                <option key={el.id} value={el.id}>
                  {el.order}. {el.id}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="relation">Relation</Label>
            <NativeSelect
              id="relation"
              name="relation"
              required
              defaultValue={FactElementRelation.SUPPORTS}
            >
              {Object.values(FactElementRelation).map((rel) => (
                <option key={rel} value={rel}>
                  {rel}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="evidenceIds">Evidence IDs (optional)</Label>
            <Input
              id="evidenceIds"
              name="evidenceIds"
              placeholder="EVID-002, EVID-005"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending} size="sm">
              {pending ? "Re-running analysis…" : "Save mapping and re-run"}
            </Button>
          </div>
        </form>
      )}
      {error ? (
        <p data-testid="manual-mapping-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}

function RerunForm({
  payload,
  formAction,
  pending,
  error,
}: {
  payload: CaseReviewWorkspacePayload;
  formAction: (payload: FormData) => void;
  pending: boolean;
  error?: string;
}) {
  return (
    <Panel
      title="Re-run analysis"
      description="Reloads the persisted request and calls the existing engine. Does not calculate a conclusion in the browser."
      testId="rerun-form"
    >
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="caseId" value={payload.caseId} />
        <input type="hidden" name="expectedVersion" value={String(payload.version)} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Re-running…" : "Re-run engine"}
        </Button>
        <span className="font-mono text-[11px] text-muted-foreground">
          version {payload.version}
        </span>
      </form>
      {error ? (
        <p data-testid="rerun-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
