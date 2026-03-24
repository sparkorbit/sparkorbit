import type {
  SourceFetchCategory,
  SourceFetchDocument,
  SourceFetchMetric,
  SourceFetchRawItemEnvelope,
  SourceFetchSourceId,
} from "../types/sourceFetch";

export type SourceSampleFile = {
  source: SourceFetchSourceId;
  endpoint: string;
  notes: string[];
  raw_items_preview: SourceFetchRawItemEnvelope[];
  documents_preview: SourceFetchDocument[];
  metrics_preview: SourceFetchMetric[];
};

export const SOURCE_CATEGORY_LABELS: Record<SourceFetchCategory, string> = {
  benchmark: "Benchmarks",
  community: "Community",
  company: "Company",
  company_cn: "Company CN",
  company_kr: "Company KR",
  papers: "Papers",
};

const sampleModules = import.meta.glob("../../PoC/source_fetch/data/runs/2026-03-24T000101Z_sample/samples/*.sample.json", {
  eager: true,
  import: "default",
}) as Record<string, SourceSampleFile>;

function compareSamples(left: SourceSampleFile, right: SourceSampleFile) {
  const leftCategory =
    left.documents_preview[0]?.source_category ?? "community";
  const rightCategory =
    right.documents_preview[0]?.source_category ?? "community";

  if (leftCategory !== rightCategory) {
    return SOURCE_CATEGORY_LABELS[leftCategory].localeCompare(
      SOURCE_CATEGORY_LABELS[rightCategory],
    );
  }

  return left.source.localeCompare(right.source);
}

export const sourceSamples = Object.values(sampleModules).sort(compareSamples);

export function prettifySourceName(source: string) {
  return source
    .split("_")
    .map((part) => {
      if (part === "ai") return "AI";
      if (part === "rss") return "RSS";
      if (part === "hf") return "HF";
      if (part === "hn") return "HN";
      if (part === "llm") return "LLM";
      if (part === "cn") return "CN";
      if (part === "kr") return "KR";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}
