import type { CSSProperties, ReactNode } from "react";

import type { DigestDetailResponse } from "../../types/dashboard";
import type { SessionDocument } from "../../types/sessionDocument";
import {
  compactText,
  formatDetailValue,
  formatDisplayDate,
  formatDocType,
  formatReadableSourceName,
  formatReadableSourceTitle,
  hasRenderableValue,
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

const ARXIV_ABSTRACT_PREFIX_PATTERNS = [
  /(^|\n\n)\s*(?:arXiv:\s*[0-9]{4}\.[0-9]{4,5}(?:v\d+)?\s+)?Announce Type:\s*[^\n]*?\s+Abstract:\s*/i,
  /(^|\n\n)\s*Abstract:\s*/i,
];

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

function stripArxivAbstractBoilerplate(document: SessionDocument, value: string | null | undefined) {
  if (!value || !document.source.startsWith("arxiv_rss_")) {
    return value ?? null;
  }

  let cleaned = value;
  for (const pattern of ARXIV_ABSTRACT_PREFIX_PATTERNS) {
    cleaned = cleaned.replace(pattern, "$1");
  }

  const normalized = cleaned.trim();
  return normalized.length > 0 ? normalized : value;
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
        <p className="orbit-wrap-anywhere whitespace-pre-line text-[0.76rem] leading-[1.7] text-orbit-text">
          {text}
        </p>
      </div>
    </section>
  );
}

function buildDocumentPrimaryText(document: SessionDocument) {
  const text =
    document.body_text ||
    document.description ||
    document.reference.snippet ||
    document.summary_input_text;
  return stripArxivAbstractBoilerplate(document, text);
}

function buildDocumentBodyLabel(document: SessionDocument) {
  if (document.doc_type === "paper" || document.source_category === "papers") {
    return "Abstract";
  }
  if (document.doc_type === "model" || document.doc_type === "model_trending") {
    return "Overview";
  }
  return "Content";
}

function buildDocumentMetaLine(document: SessionDocument) {
  return [
    formatReadableSourceName(document.source),
    formatDisplayDate(document.published_at) || formatDisplayDate(document.updated_at),
  ]
    .filter((segment): segment is string => Boolean(segment))
    .join(" · ");
}

function buildDocumentPreview(document: SessionDocument) {
  return compactText(
    stripArxivAbstractBoilerplate(
      document,
      document.description ||
        document.reference.snippet ||
        document.body_text ||
        document.summary_input_text,
    ),
    220,
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
  onOpenDocument: (documentId: string) => void;
}) {
  const digestUpdatedAt = formatDisplayDate(payload.digest.updatedAt);

  return (
    <div className="flex h-full min-h-0 flex-col bg-orbit-bg">
      <div className="min-h-0 flex-1 overflow-auto bg-orbit-bg p-1">
        <div className="flex min-h-full flex-col gap-2">
          <HackerRevealCard delayMs={0}>
            <section className="border border-orbit-border bg-orbit-bg-elevated p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                    {payload.digest.domain}
                  </p>
                  <h3 className="orbit-wrap-anywhere mt-2 font-display text-[0.98rem] font-semibold leading-[1.45] text-orbit-text">
                    {payload.digest.headline}
                  </h3>
                  {digestUpdatedAt ? (
                    <p className="mt-2 font-mono text-[0.58rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
                      {digestUpdatedAt}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="shrink-0 border border-orbit-border-strong bg-orbit-bg px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-text transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                  onClick={onClose}
                >
                  back to list
                </button>
              </div>
            </section>
          </HackerRevealCard>

          <HackerRevealCard delayMs={90}>
            <DetailTextBlock label="summary" text={payload.digest.summary} />
          </HackerRevealCard>

          <HackerRevealCard delayMs={160}>
            <section className="border border-orbit-border bg-orbit-bg-elevated p-3">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                Related Items
              </p>
              <div className="mt-3 grid gap-2">
                {payload.documents.map((document) => (
                  <button
                    key={document.document_id}
                    type="button"
                    className="border border-orbit-border bg-orbit-bg px-3 py-3 text-left transition-colors duration-150 hover:border-orbit-accent"
                    onClick={() => onOpenDocument(document.document_id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="orbit-wrap-anywhere min-w-0 flex-1 font-display text-[0.8rem] font-semibold text-orbit-text">
                        {document.title}
                      </p>
                      {formatDisplayDate(document.published_at) ? (
                        <span className="shrink-0 font-mono text-[0.56rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
                          {formatDisplayDate(document.published_at)}
                        </span>
                      ) : null}
                    </div>
                    <p className="orbit-wrap-anywhere mt-2 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-orbit-accent-dim">
                      {formatReadableSourceTitle(
                        document.source_category,
                        document.source,
                      )}
                    </p>
                    {buildDocumentPreview(document) ? (
                      <p className="orbit-wrap-anywhere mt-2 text-[0.72rem] leading-[1.55] text-orbit-text">
                        {buildDocumentPreview(document)}
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
  const contextFields = filterDetailFields([
    createDetailField("source", formatReadableSourceName(document.source)),
    createDetailField("type", formatDocType(document.doc_type)),
    createDetailField("published", formatDisplayDate(document.published_at)),
    createDetailField("updated", formatDisplayDate(document.updated_at)),
  ]);
  const authorItems = buildDocumentAuthorItems(document);
  const primaryText = buildDocumentPrimaryText(document);
  const metaLine = buildDocumentMetaLine(document);
  const openLinkLabel =
    document.doc_type === "paper" ? "open paper" : "open link";

  return (
    <div className="flex h-full min-h-0 flex-col bg-orbit-bg">
      <div className="min-h-0 flex-1 overflow-auto bg-orbit-bg p-1">
        <div className="flex min-h-full flex-col gap-2">
          <HackerRevealCard delayMs={0}>
            <section className="border border-orbit-border bg-orbit-bg-elevated p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orbit-border pb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-orbit-accent">
                    {formatReadableSourceTitle(
                      document.source_category,
                      document.source,
                    )}
                  </p>
                  <h3 className="orbit-wrap-anywhere mt-2 font-display text-[0.98rem] font-semibold leading-[1.45] text-orbit-text">
                    {document.title}
                  </h3>
                  {metaLine ? (
                    <p className="orbit-wrap-anywhere mt-2 text-[0.72rem] leading-[1.55] text-orbit-text">
                      {metaLine}
                    </p>
                  ) : null}
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
                    {openLinkLabel}
                  </button>
                  <button
                    type="button"
                    className="border border-orbit-border-strong bg-orbit-bg px-3 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-orbit-text transition-colors duration-150 hover:border-orbit-accent hover:text-orbit-accent"
                    onClick={onClose}
                  >
                    back to list
                  </button>
                </div>
              </div>
            </section>
          </HackerRevealCard>

          <HackerRevealCard delayMs={90}>
            <DetailTextBlock
              label={buildDocumentBodyLabel(document)}
              text={primaryText}
            />
          </HackerRevealCard>

          {authorItems.length > 0 ? (
            <HackerRevealCard delayMs={140}>
              <DetailChipBlock label="Authors" items={authorItems} />
            </HackerRevealCard>
          ) : null}

          <HackerRevealCard delayMs={200}>
            <DetailFieldGrid label="Document Info" fields={contextFields} />
          </HackerRevealCard>
        </div>
      </div>
    </div>
  );
}
