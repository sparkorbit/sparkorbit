import type { CSSProperties, ReactNode } from "react";

import type { DigestDetailResponse } from "../../types/dashboard";
import type { SessionDocument } from "../../types/sessionDocument";
import {
  compactText,
  formatBenchmarkKind,
  formatBenchmarkScore,
  formatBenchmarkUnit,
  formatDetailValue,
  formatDocType,
  formatLeaderboardValue,
  formatSourceCategory,
  formatTextScope,
  formatTimeSemantics,
  formatTimestampKind,
  hasRenderableValue,
  toRecordArray,
  toRenderableStringArray,
} from "./display";

export type DetailState =
  | {
      kind: "digest";
      payload: DigestDetailResponse;
    }
  | {
      kind: "document";
      payload: SessionDocument;
    }
  | null;

type DetailField = {
  label: string;
  value: string;
  href?: string | null;
};

function createDetailField(
  label: string,
  value: unknown,
  options?: { href?: string | null },
): DetailField | null {
  if (!hasRenderableValue(value)) {
    return null;
  }
  return {
    label,
    value: formatDetailValue(value),
    href: options?.href ?? null,
  };
}

function filterDetailFields(
  fields: Array<DetailField | null | undefined>,
): DetailField[] {
  return fields.filter((field): field is DetailField => field != null);
}

function buildRecordFields(
  record: Record<string, unknown>,
  options?: {
    maxItems?: number;
    labelTransform?: (key: string) => string;
  },
) {
  return filterDetailFields(
    Object.entries(record)
      .filter(([, value]) => hasRenderableValue(value))
      .slice(0, options?.maxItems ?? 8)
      .map(([key, value]) =>
        createDetailField(
          options?.labelTransform ? options.labelTransform(key) : key,
          value,
        ),
      ),
  );
}

function buildDocumentIdentityFields(document: SessionDocument) {
  return filterDetailFields([
    createDetailField("document_id", document.document_id),
    createDetailField("run_id", document.run_id),
    createDetailField("source", document.source),
    createDetailField(
      "source_category",
      formatSourceCategory(document.source_category),
    ),
    createDetailField("doc_type", formatDocType(document.doc_type)),
    createDetailField("content_type", formatDocType(document.content_type)),
    createDetailField("source_item_id", document.source_item_id),
    createDetailField("language", document.language),
    createDetailField("content_format", document.content_format),
    createDetailField("text_scope", formatTextScope(document.text_scope)),
    createDetailField(
      "timestamp_kind",
      formatTimestampKind(document.timestamp_kind),
    ),
  ]);
}

function buildDocumentTimeFields(document: SessionDocument) {
  return filterDetailFields([
    createDetailField("published_at", document.published_at),
    createDetailField("updated_at", document.updated_at),
    createDetailField("sort_at", document.sort_at),
    createDetailField("fetched_at", document.fetched_at),
    createDetailField(
      "time_semantics",
      formatTimeSemantics(document.time_semantics),
    ),
    createDetailField("source_method", document.source_method),
  ]);
}

function buildDocumentSignalFields(document: SessionDocument) {
  return filterDetailFields([
    createDetailField("feed_score", document.ranking.feed_score),
    createDetailField("priority_reason", document.ranking.priority_reason),
    createDetailField("spark_score", document.discovery.spark_score),
    createDetailField("discovery_reason", document.discovery.primary_reason),
    createDetailField("importance_score", document.llm.importance_score),
    createDetailField("importance_reason", document.llm.importance_reason),
    createDetailField(
      "engagement_primary_name",
      document.engagement_primary.name,
    ),
    createDetailField(
      "engagement_primary_value",
      document.engagement_primary.value,
    ),
  ]);
}

function buildDocumentReferenceFields(document: SessionDocument) {
  return filterDetailFields([
    createDetailField("reference_url", document.reference_url, {
      href: document.reference_url,
    }),
    createDetailField("canonical_url", document.canonical_url, {
      href: document.canonical_url,
    }),
    createDetailField("url", document.url, {
      href: document.url,
    }),
    createDetailField("display_url", document.reference.display_url, {
      href: document.reference.display_url,
    }),
    createDetailField("source_endpoint", document.source_endpoint, {
      href: document.source_endpoint,
    }),
  ]);
}

function buildDocumentRelatedLinkFields(document: SessionDocument) {
  return filterDetailFields(
    document.related_urls.map((url, index) =>
      createDetailField(`related_${index + 1}`, url, { href: url }),
    ),
  );
}

function buildDocumentLlmFields(document: SessionDocument) {
  return filterDetailFields([
    createDetailField("status", document.llm.status),
    createDetailField("summary_1l", document.llm.summary_1l),
    createDetailField("summary_short", document.llm.summary_short),
    createDetailField(
      "primary_domain",
      formatSourceCategory(document.llm.primary_domain),
    ),
    createDetailField("importance_score", document.llm.importance_score),
    createDetailField("importance_reason", document.llm.importance_reason),
    createDetailField("model_name", document.llm.run_meta.model_name),
    createDetailField("prompt_version", document.llm.run_meta.prompt_version),
    createDetailField(
      "fewshot_pack_version",
      document.llm.run_meta.fewshot_pack_version,
    ),
    createDetailField("generated_at", document.llm.run_meta.generated_at),
  ]);
}

function buildDocumentBenchmarkFields(document: SessionDocument) {
  const benchmark = document.benchmark;
  return filterDetailFields([
    createDetailField("board_name", benchmark.board_name),
    createDetailField("kind", formatBenchmarkKind(benchmark.kind)),
    createDetailField("rank", benchmark.rank),
    createDetailField(
      "score",
      formatBenchmarkScore(
        benchmark.score_label,
        benchmark.score_value,
        benchmark.score_unit,
      ),
    ),
    createDetailField("score_label", benchmark.score_label),
    createDetailField("score_value", benchmark.score_value),
    createDetailField("score_unit", formatBenchmarkUnit(benchmark.score_unit)),
    createDetailField("votes", benchmark.votes),
    createDetailField("model_name", benchmark.model_name),
    createDetailField("organization", benchmark.organization),
    createDetailField("snapshot_at", benchmark.snapshot_at),
    createDetailField("total_models", benchmark.total_models),
    createDetailField("total_votes", benchmark.total_votes),
  ]);
}

function buildDocumentModelFields(document: SessionDocument) {
  if (!["model", "model_trending"].includes(document.doc_type)) {
    return [];
  }

  const metadata = document.metadata;
  return filterDetailFields([
    createDetailField("pipeline_tag", metadata["pipeline_tag"]),
    createDetailField("library_name", metadata["library_name"]),
    createDetailField(
      "license_tags",
      toRenderableStringArray(metadata["license_tags"]),
    ),
    createDetailField("regions", toRenderableStringArray(metadata["regions"])),
    createDetailField("arxiv_ids", toRenderableStringArray(metadata["arxiv_ids"])),
    createDetailField("private", metadata["private"]),
    createDetailField("eval_results", metadata["eval_results"]),
  ]);
}

function buildDocumentMetadataFields(document: SessionDocument) {
  return buildRecordFields(document.metadata, { maxItems: 10 });
}

function buildDocumentExternalIdFields(document: SessionDocument) {
  return buildRecordFields(document.external_ids, { maxItems: 10 });
}

function buildDocumentRawRefFields(document: SessionDocument) {
  return buildRecordFields(document.raw_ref, { maxItems: 10 });
}

function buildDocumentTagItems(document: SessionDocument) {
  return document.tags.filter((tag) => tag.trim().length > 0);
}

function buildDocumentAuthorItems(document: SessionDocument) {
  const authors =
    document.authors.length > 0
      ? document.authors
      : document.author
        ? [document.author]
        : [];

  return authors.filter((author) => author.trim().length > 0);
}

function buildDocumentEntityItems(document: SessionDocument) {
  return [...document.llm.entities, ...document.llm.subdomains].filter(
    (item) => item.trim().length > 0,
  );
}

function buildDocumentEvidenceChunkItems(document: SessionDocument) {
  return document.llm.evidence_chunk_ids.filter(
    (item) => item.trim().length > 0,
  );
}

function buildDocumentBenchmarkEntryItems(document: SessionDocument) {
  const metadata = document.metadata;
  const topEntries = toRecordArray(metadata["top_entries"]);
  const entries =
    topEntries.length > 0 ? topEntries : toRecordArray(metadata["entries"]);

  return entries
    .slice(0, 5)
    .map((entry) => {
      const rank = formatDetailValue(entry["rank"]);
      const modelName = formatDetailValue(entry["model_name"]);
      const organization = formatDetailValue(entry["organization"]);
      const rating = formatLeaderboardValue(entry["rating"]);
      const votes = formatLeaderboardValue(entry["votes"]);
      const segments = [
        rank !== "-" ? `#${rank}` : null,
        modelName !== "-" ? modelName : null,
        organization !== "-" ? organization : null,
        rating !== "-" ? `rating ${rating}` : null,
        votes !== "-" ? `votes ${votes}` : null,
      ].filter((segment): segment is string => segment != null);

      return compactText(segments.join(" / "), 160);
    })
    .filter((item) => item.length > 0);
}

function DetailFieldGrid({
  label,
  fields,
}: {
  label: string;
  fields: readonly DetailField[];
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <section className="border border-orbit-border bg-orbit-bg-elevated p-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
        {label}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {fields.map((field) => (
          <article
            key={`${field.label}-${field.value}`}
            className="border border-orbit-border bg-orbit-bg p-3"
          >
            <p className="font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
              {field.label}
            </p>
            {field.href ? (
              <a
                href={field.href}
                target="_blank"
                rel="noreferrer"
                className="orbit-wrap-anywhere mt-2 block text-[0.76rem] leading-[1.6] text-orbit-text underline underline-offset-4 hover:text-orbit-accent"
              >
                {field.value}
              </a>
            ) : (
              <p className="orbit-wrap-anywhere mt-2 text-[0.76rem] leading-[1.6] text-orbit-text">
                {field.value}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function DetailChipBlock({
  label,
  items,
}: {
  label: string;
  items: readonly string[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="border border-orbit-border bg-orbit-bg-elevated p-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
        {label}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="border border-orbit-border bg-orbit-bg px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-orbit-text"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function DetailTextBlock({
  label,
  text,
}: {
  label: string;
  text: string | null | undefined;
}) {
  if (!text) {
    return null;
  }

  return (
    <section className="border border-orbit-border bg-orbit-bg-elevated p-3">
      <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
        {label}
      </p>
      <div className="mt-3 border border-orbit-border bg-orbit-bg px-3 py-3">
        <p className="orbit-wrap-anywhere text-[0.76rem] leading-[1.7] text-orbit-text">
          {text}
        </p>
      </div>
    </section>
  );
}

export function HackerRevealCard({
  delayMs = 0,
  children,
}: {
  delayMs?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="orbit-hacker-reveal"
      style={{ "--hacker-delay": `${delayMs}ms` } as CSSProperties}
    >
      <div className="orbit-hacker-reveal__content">{children}</div>
    </div>
  );
}

export function DigestDetailPanel({
  payload,
  onClose,
  onOpenDocument,
}: {
  payload: DigestDetailResponse;
  onClose: () => void;
  onOpenDocument: (documentId: string, referenceUrl: string) => void;
}) {
  const digestFields = filterDetailFields([
    createDetailField("session_id", payload.sessionId),
    createDetailField("status", payload.status),
    createDetailField("domain", payload.digest.domain),
    createDetailField("evidence", payload.digest.evidence),
    createDetailField("updated_at", payload.digest.updatedAt),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-orbit-bg">
      <div className="min-h-0 flex-1 overflow-auto bg-orbit-bg p-1">
        <div className="flex min-h-full flex-col gap-2">
          <HackerRevealCard delayMs={0}>
            <section className="border border-orbit-border bg-orbit-bg-elevated p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                    {payload.status}
                  </p>
                  <h3 className="orbit-wrap-anywhere mt-2 font-display text-[0.98rem] font-semibold leading-[1.45] text-orbit-text">
                    {payload.digest.headline}
                  </h3>
                </div>
                <button
                  type="button"
                  className="shrink-0 border border-orbit-border-strong bg-orbit-bg px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-text transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                  onClick={onClose}
                >
                  trace stack
                </button>
              </div>
            </section>
          </HackerRevealCard>

          <HackerRevealCard delayMs={90}>
            <DetailTextBlock label="signal brief" text={payload.digest.summary} />
          </HackerRevealCard>

          <HackerRevealCard delayMs={140}>
            <DetailFieldGrid label="Sweep Context" fields={digestFields} />
          </HackerRevealCard>

          <HackerRevealCard delayMs={200}>
            <DetailChipBlock label="Trace IDs" items={payload.digest.documentIds} />
          </HackerRevealCard>

          <HackerRevealCard delayMs={260}>
            <section className="border border-orbit-border bg-orbit-bg-elevated p-3">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                Linked Traces
              </p>
              <div className="mt-3 grid gap-2">
                {payload.documents.map((document) => (
                  <button
                    key={document.document_id}
                    type="button"
                    className="border border-orbit-border bg-orbit-bg px-3 py-3 text-left transition-colors duration-150 hover:border-orbit-accent"
                    onClick={() =>
                      onOpenDocument(
                        document.document_id,
                        document.reference_url ||
                          document.canonical_url ||
                          document.url ||
                          "",
                      )
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="orbit-wrap-anywhere min-w-0 flex-1 font-display text-[0.8rem] font-semibold text-orbit-text">
                        {document.title}
                      </p>
                      <span className="orbit-token-ellipsis inline-flex max-w-[10rem] border border-orbit-border bg-orbit-panel px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-orbit-text">
                        {document.llm.status}
                      </span>
                    </div>
                    <p className="orbit-wrap-anywhere mt-2 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
                      {document.source} / {formatDocType(document.doc_type)}
                    </p>
                    {document.llm.summary_short ? (
                      <p className="orbit-wrap-anywhere mt-2 text-[0.72rem] leading-[1.55] text-orbit-text">
                        {document.llm.summary_short}
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          </HackerRevealCard>
        </div>
      </div>
    </div>
  );
}

export function DocumentDetailPanel({
  document,
  onClose,
}: {
  document: SessionDocument;
  onClose: () => void;
}) {
  const referenceUrl =
    document.reference_url || document.canonical_url || document.url;
  const identityFields = buildDocumentIdentityFields(document);
  const timeFields = buildDocumentTimeFields(document);
  const signalFields = buildDocumentSignalFields(document);
  const referenceFields = buildDocumentReferenceFields(document);
  const relatedFields = buildDocumentRelatedLinkFields(document);
  const llmFields = buildDocumentLlmFields(document);
  const benchmarkFields = buildDocumentBenchmarkFields(document);
  const modelFields = buildDocumentModelFields(document);
  const metadataFields = buildDocumentMetadataFields(document);
  const externalIdFields = buildDocumentExternalIdFields(document);
  const rawRefFields = buildDocumentRawRefFields(document);
  const authorItems = buildDocumentAuthorItems(document);
  const tagItems = buildDocumentTagItems(document);
  const entityItems = buildDocumentEntityItems(document);
  const evidenceChunkItems = buildDocumentEvidenceChunkItems(document);
  const benchmarkEntryItems = buildDocumentBenchmarkEntryItems(document);

  return (
    <div className="flex h-full min-h-0 flex-col bg-orbit-bg">
      <div className="min-h-0 flex-1 overflow-auto bg-orbit-bg p-1">
        <div className="flex min-h-full flex-col gap-2">
          <HackerRevealCard delayMs={0}>
            <section className="border border-orbit-border bg-orbit-bg-elevated p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                    {document.llm.status}
                  </p>
                  <h3 className="orbit-wrap-anywhere mt-2 font-display text-[0.98rem] font-semibold leading-[1.45] text-orbit-text">
                    {document.title}
                  </h3>
                  <p className="orbit-wrap-anywhere mt-2 text-[0.72rem] leading-[1.55] text-orbit-text">
                    {document.source} / {formatDocType(document.doc_type)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="border border-orbit-border bg-orbit-bg px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-text transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                    onClick={() =>
                      referenceUrl &&
                      window.open(referenceUrl, "_blank", "noopener,noreferrer")
                    }
                  >
                    open link
                  </button>
                  <button
                    type="button"
                    className="border border-orbit-border-strong bg-orbit-bg px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-text transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                    onClick={onClose}
                  >
                    trace stack
                  </button>
                </div>
              </div>
            </section>
          </HackerRevealCard>

          <HackerRevealCard delayMs={90}>
            <DetailTextBlock label="brief" text={document.description} />
          </HackerRevealCard>

          <HackerRevealCard delayMs={140}>
            <DetailFieldGrid label="ID Trace" fields={identityFields} />
          </HackerRevealCard>

          <HackerRevealCard delayMs={200}>
            <DetailFieldGrid label="Timecode" fields={timeFields} />
          </HackerRevealCard>

          <HackerRevealCard delayMs={260}>
            <DetailFieldGrid label="Signal Readout" fields={signalFields} />
          </HackerRevealCard>

          <HackerRevealCard delayMs={320}>
            <DetailChipBlock label="Operators" items={authorItems} />
          </HackerRevealCard>

          <HackerRevealCard delayMs={380}>
            <DetailChipBlock label="Tags" items={tagItems} />
          </HackerRevealCard>

          <HackerRevealCard delayMs={440}>
            <DetailChipBlock label="Entities / Subdomains" items={entityItems} />
          </HackerRevealCard>

          {evidenceChunkItems.length > 0 ? (
            <HackerRevealCard delayMs={500}>
              <DetailChipBlock
                label="Evidence Chunks"
                items={evidenceChunkItems}
              />
            </HackerRevealCard>
          ) : null}

          <HackerRevealCard delayMs={560}>
            <DetailFieldGrid label="Ingress Links" fields={referenceFields} />
          </HackerRevealCard>

          {relatedFields.length > 0 ? (
            <HackerRevealCard delayMs={620}>
              <DetailFieldGrid label="Side Links" fields={relatedFields} />
            </HackerRevealCard>
          ) : null}

          <HackerRevealCard delayMs={680}>
            <DetailFieldGrid label="LLM Sweep" fields={llmFields} />
          </HackerRevealCard>

          {benchmarkFields.length > 0 ? (
            <HackerRevealCard delayMs={740}>
              <DetailFieldGrid label="Rank Trace" fields={benchmarkFields} />
            </HackerRevealCard>
          ) : null}

          {benchmarkEntryItems.length > 0 ? (
            <HackerRevealCard delayMs={780}>
              <DetailChipBlock
                label="Rank Entries"
                items={benchmarkEntryItems}
              />
            </HackerRevealCard>
          ) : null}

          {modelFields.length > 0 ? (
            <HackerRevealCard delayMs={820}>
              <DetailFieldGrid label="Model Trace" fields={modelFields} />
            </HackerRevealCard>
          ) : null}

          {metadataFields.length > 0 ? (
            <HackerRevealCard delayMs={860}>
              <DetailFieldGrid label="Meta Dump" fields={metadataFields} />
            </HackerRevealCard>
          ) : null}

          {externalIdFields.length > 0 ? (
            <HackerRevealCard delayMs={920}>
              <DetailFieldGrid label="External Keys" fields={externalIdFields} />
            </HackerRevealCard>
          ) : null}

          {rawRefFields.length > 0 ? (
            <HackerRevealCard delayMs={980}>
              <DetailFieldGrid label="Raw Trace" fields={rawRefFields} />
            </HackerRevealCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
