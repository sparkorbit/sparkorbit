import type {
  AskPrompt,
  DigestItem,
  EvidenceStep,
  FeedItem,
  FeedPanel,
  ReferenceItem,
  RuntimeItem,
  SessionMetric,
} from "./dashboardContent";
import type { SourceFetchDocument } from "../types/sourceFetch";
import {
  prettifySourceName,
  sourceSamples,
  SOURCE_CATEGORY_LABELS,
} from "./sourceSamples";

function formatNumber(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "-";
  }

  return new Intl.NumberFormat("ko-KR", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "시간 없음";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function compactText(value: string | null | undefined, maxLength = 110) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
}

function buildMeta(document: SourceFetchDocument) {
  if (document.doc_type === "repo") {
    return [
      `★ ${formatNumber(Number(document.engagement.stars ?? 0))}`,
      String(document.metadata.language ?? "-"),
      formatDate(document.published_at),
    ].join(" · ");
  }

  if (document.doc_type === "model" || document.doc_type === "model_trending") {
    return [
      `♥ ${formatNumber(Number(document.engagement.likes ?? 0))}`,
      `↓ ${formatNumber(Number(document.engagement.downloads ?? 0))}`,
      String(document.metadata.pipeline_tag ?? "-"),
    ].join(" · ");
  }

  if (
    document.doc_type === "benchmark" ||
    document.doc_type === "benchmark_panel"
  ) {
    return [
      document.benchmark.board_name ?? "Leaderboard",
      document.benchmark.score_value == null
        ? "-"
        : `${document.benchmark.score_value}`,
      formatDate(document.published_at),
    ].join(" · ");
  }

  if (document.doc_type === "paper") {
    return [
      `${document.authors.length || 1}명`,
      document.tags.find((tag) => tag.startsWith("cs.")) ?? document.doc_type,
      formatDate(document.published_at),
    ].join(" · ");
  }

  return [document.author ?? document.source, formatDate(document.published_at)]
    .filter(Boolean)
    .join(" · ");
}

function buildNote(document: SourceFetchDocument) {
  if (document.doc_type === "repo") {
    return compactText(
      `${document.description ?? "저장소 설명 없음"} / license ${String(
        document.metadata.license ?? "-",
      )} / branch ${String(document.metadata.default_branch ?? "-")}`,
      120,
    );
  }

  if (document.doc_type === "model" || document.doc_type === "model_trending") {
    return compactText(
      `${document.description ?? document.title} / library ${String(
        document.metadata.library_name ?? "-",
      )} / pipeline ${String(document.metadata.pipeline_tag ?? "-")}`,
      120,
    );
  }

  if (
    document.doc_type === "benchmark" ||
    document.doc_type === "benchmark_panel"
  ) {
    return compactText(
      `${document.description ?? document.title} / architecture ${String(
        document.metadata.architecture ?? "-",
      )} / params ${String(document.metadata.params_b ?? "-")}B`,
      120,
    );
  }

  if (document.doc_type === "paper") {
    return compactText(
      document.description ||
        document.reference.snippet ||
        document.summary_input_text,
      120,
    );
  }

  return compactText(
    document.description || document.reference.snippet || document.body_text,
    120,
  );
}

function buildFeedItems(sampleId: string) {
  const sample = sourceSamples.find((entry) => entry.source === sampleId);

  if (!sample) {
    return [];
  }

  return sample.documents_preview.slice(0, 3).map(
    (document): FeedItem => ({
      source: prettifySourceName(sample.source),
      type: document.doc_type,
      title: document.title,
      meta: buildMeta(document),
      note: buildNote(document),
    }),
  );
}

const allDocuments = sourceSamples.flatMap((sample) => sample.documents_preview);
const allMetrics = sourceSamples.flatMap((sample) => sample.metrics_preview);
const runId = allDocuments[0]?.run_id ?? "sample_run";
const fetchedAt = allDocuments[0]?.fetched_at ?? "2026-03-24T00:01:01Z";
const categoryDigests = Object.entries(SOURCE_CATEGORY_LABELS).map(
  ([category, label]) => {
    const categorySamples = sourceSamples.filter(
      (sample) => sample.documents_preview[0]?.source_category === category,
    );
    const categoryDocs = categorySamples.flatMap((sample) => sample.documents_preview);
    const topTitle = categoryDocs[0]?.title ?? "대표 문서 없음";

    return {
      domain: label,
      headline: `${categorySamples.length}개 source / ${categoryDocs.length}개 preview 문서`,
      summary: compactText(topTitle, 88),
      evidence: `${categorySamples.reduce(
        (count, sample) => count + sample.metrics_preview.length,
        0,
      )} metrics`,
    } satisfies DigestItem;
  },
);

export const sampleDashboardContent = {
  brand: {
    name: "SparkOrbit",
    tagline: "Source Fetch Sample Monitor",
  },
  session: {
    title: "샘플 / 렌더 세션",
    sessionId: runId,
    sessionDate: fetchedAt.slice(0, 10),
    window: "sample snapshot",
    reloadRule: "PoC/source_fetch sample JSON을 기준으로 source별 핵심 필드만 렌더링합니다.",
    metrics: [
      {
        label: "소스 수",
        value: `${sourceSamples.length}`,
        note: "sample 디렉터리에서 감지된 source 패널 수",
      },
      {
        label: "문서 프리뷰",
        value: `${allDocuments.length}`,
        note: "각 source의 documents_preview를 그리드 패널에 직접 연결",
      },
      {
        label: "메트릭",
        value: `${allMetrics.length}`,
        note: "repo, model, leaderboard 계열의 수치 필드는 문서 note에 반영",
      },
    ] satisfies SessionMetric[],
    runtime: [
      {
        name: "collector",
        role: "sample JSON glob import로 source 파일을 정적으로 수집합니다",
        status: "samples eager",
      },
      {
        name: "enricher",
        role: "documents_preview를 source별 FeedPanel 아이템으로 재구성합니다",
        status: "source mapped",
      },
      {
        name: "redis",
        role: "런타임 저장소 대신 sample snapshot이 세션 원본 역할을 합니다",
        status: "static source",
      },
      {
        name: "ui",
        role: "기존 패널 UX를 유지한 채 source 데이터만 교체합니다",
        status: "grid preserved",
      },
    ] satisfies RuntimeItem[],
    rules: [
      "기존 패널 그리드 UX와 D&D / resize 동작은 유지합니다.",
      "각 source는 독립 패널로 남기고 documents_preview 상위 3건만 노출합니다.",
      "문서 타입마다 중요한 필드만 meta / note 라인에 압축해서 보여줍니다.",
    ],
  },
  summary: {
    title: "샘플 다이제스트",
    headline:
      "source별 sample 데이터를 기존 대시보드 패널 구조에 맞춰 압축해 렌더링합니다.",
    digests: categoryDigests.slice(0, 6),
  },
  feeds: sourceSamples.map(
    (sample): FeedPanel => ({
      id: sample.source,
      title: prettifySourceName(sample.source),
      eyebrow:
        SOURCE_CATEGORY_LABELS[
          sample.documents_preview[0]?.source_category ?? "community"
        ],
      sourceNote:
        sample.notes[0] ||
        compactText(sample.endpoint, 64) ||
        `${sample.documents_preview.length} preview documents`,
      items: buildFeedItems(sample.source),
    }),
  ),
  ask: {
    title: "질문 / 해석 레인",
    description:
      "sample source를 비교하면서 어떤 source가 repo / model / paper / benchmark 흐름인지 빠르게 질문할 수 있도록 구성합니다.",
    prompts: [
      {
        question: "어떤 source가 숫자형 지표를 가장 많이 포함하나요?",
        grounding: "metrics_preview 수 + repo / model / benchmark 패널 note",
      },
      {
        question: "논문 source와 기업 blog source는 어떤 필드가 다르게 강조되나요?",
        grounding: "paper의 author / tags vs blog의 author / freshness / description",
      },
      {
        question: "GitHub source에서 지금 바로 읽어야 할 저장소는 무엇인가요?",
        grounding: "stars / forks / language / license가 포함된 meta line",
      },
    ] satisfies AskPrompt[],
    references: [
      {
        title: "documents_preview",
        source: "sample JSON",
        note: "패널 본문은 documents_preview 상위 3건을 그대로 사용합니다.",
      },
      {
        title: "metrics_preview",
        source: "sample JSON",
        note: "수치형 field는 meta / note 요약에 우선 반영합니다.",
      },
      {
        title: "sourceNote",
        source: "endpoint / notes",
        note: "패널 상단 설명은 sample notes가 있으면 우선 사용합니다.",
      },
    ] satisfies ReferenceItem[],
  },
  evidence: {
    title: "렌더링 규칙 / 근거",
    description:
      "source별로 중요한 필드를 다르게 꺼내되, 전체 UI 구조와 패널 컴포넌트는 그대로 유지합니다.",
    steps: [
      {
        step: "01",
        title: "Source",
        detail: "sample 파일 하나를 패널 하나로 대응시킵니다.",
      },
      {
        step: "02",
        title: "Preview",
        detail: "documents_preview 상위 3개를 카드로 변환합니다.",
      },
      {
        step: "03",
        title: "Priority",
        detail: "repo/model/paper/benchmark별 중요 필드를 다르게 meta에 압축합니다.",
      },
      {
        step: "04",
        title: "Grid",
        detail: "기존 그리드, 패널 스타일, D&D/resize UX는 그대로 유지합니다.",
      },
    ] satisfies EvidenceStep[],
    references: [
      {
        title: "Repo rule",
        source: "engagement + metadata",
        note: "stars, forks, language, license를 가장 먼저 보여줍니다.",
      },
      {
        title: "Model rule",
        source: "engagement + metadata",
        note: "likes, downloads, pipeline, library를 우선 노출합니다.",
      },
      {
        title: "Paper / Blog rule",
        source: "documents_preview",
        note: "author, date, snippet 중심으로 정보 밀도를 맞춥니다.",
      },
    ] satisfies ReferenceItem[],
  },
} as const;
