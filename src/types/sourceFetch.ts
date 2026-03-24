export const SOURCE_FETCH_SOURCE_IDS = [
  "amazon_science",
  "anthropic_news",
  "apple_ml",
  "arxiv_rss_cs_ai",
  "arxiv_rss_cs_lg",
  "deepmind_blog",
  "deepseek_updates",
  "github_bytedance_repos",
  "github_curated_repos",
  "github_mindspore_repos",
  "github_paddlepaddle_repos",
  "github_tencent_hunyuan_repos",
  "google_ai_blog",
  "groq_newsroom",
  "hf_blog",
  "hf_daily_papers",
  "hf_models_likes",
  "hf_models_new",
  "hf_trending_models",
  "hn_topstories",
  "kakao_tech_rss",
  "lg_ai_research_blog",
  "lg_ai_research_news",
  "lmarena_overview",
  "microsoft_research",
  "mistral_news",
  "naver_cloud_blog_rss",
  "nvidia_deep_learning",
  "open_llm_leaderboard",
  "openai_news_rss",
  "qwen_blog_rss",
  "reddit_localllama",
  "reddit_machinelearning",
  "salesforce_ai_research_rss",
  "samsung_research_posts",
  "stability_news",
  "upstage_blog",
] as const;

export type SourceFetchSourceId = (typeof SOURCE_FETCH_SOURCE_IDS)[number];

export type SourceFetchProfile = "smoke" | "sample" | "full";

export type SourceFetchStatus = "ok" | "skipped" | "excluded" | "error";

export type SourceFetchMethod = "rss" | "api" | "json" | "scrape";

export type SourceFetchCategory =
  | "papers"
  | "company"
  | "company_kr"
  | "company_cn"
  | "community"
  | "benchmark";

export type SourceFetchDocType =
  | "paper"
  | "blog"
  | "news"
  | "post"
  | "model"
  | "model_trending"
  | "repo"
  | "release"
  | "release_note"
  | "benchmark"
  | "benchmark_panel";

export type SourceFetchTextScope =
  | "full_text"
  | "abstract"
  | "excerpt"
  | "metadata_only"
  | "empty"
  | "generated_panel"
  | "metric_summary";

export type SourceFetchTimeSemantics =
  | "published"
  | "updated"
  | "created"
  | "snapshot"
  | "submission"
  | "observed"
  | "unknown";

export type SourceFetchContentFormat = "plain_text";

export type SourceFetchFreshnessBucket =
  | "just_now"
  | "new"
  | "recent"
  | "active"
  | "established";

export type SourceFetchSparkBucket = "sparkling" | "rising" | "new" | "steady";

export type SourceFetchFeedBucket = "top" | "live" | "recent" | "archive";

export type SourceFetchMetricKind = "gauge";

export interface SourceFetchRunManifest {
  run_id: string;
  profile: SourceFetchProfile;
  limit: number;
  started_at: string;
  finished_at: string;
  git_commit: string | null;
  requested_sources: SourceFetchSourceId[];
  success_count: number;
  skipped_count: number;
  excluded_count: number;
  error_count: number;
}

export interface SourceFetchSourceManifestEntry {
  source: SourceFetchSourceId;
  endpoint: string;
  status: SourceFetchStatus;
  item_count: number;
  normalized_count: number;
  metric_count: number;
  excluded_document_count: number;
  notes: string[];
  duration_ms: number;
  raw_response_paths: string[];
  raw_items_path: string | null;
  sample_path: string | null;
}

export interface SourceFetchDiscoveryProfile {
  is_new: boolean | null;
  age_hours: number | null;
  freshness_bucket: SourceFetchFreshnessBucket | null;
  spark_score: number | null;
  spark_bucket: SourceFetchSparkBucket | null;
  primary_reason: string | null;
}

export interface SourceFetchRankingProfile {
  feed_score: number | null;
  feed_bucket: SourceFetchFeedBucket | null;
  age_penalty: number | null;
  evergreen_bonus: number | null;
  priority_reason: string | null;
}

export interface SourceFetchBenchmarkProfile {
  kind: string | null;
  board_id: string | null;
  board_name: string | null;
  snapshot_at: string | null;
  rank: number | null;
  score_label: string | null;
  score_value: number | string | null;
  score_unit: string | null;
  votes: number | null;
  model_name: string | null;
  organization: string | null;
  total_models: number | null;
  total_votes: number | null;
}

export interface SourceFetchReference {
  source_label: string | null;
  display_title: string | null;
  display_url: string | null;
  snippet: string | null;
}

export interface SourceFetchLlmRunMeta {
  model_name: string | null;
  prompt_version: string | null;
  fewshot_pack_version: string | null;
  generated_at: string | null;
}

export interface SourceFetchLlmProfile {
  status: "pending" | "complete" | "error" | string;
  summary_1l: string | null;
  summary_short: string | null;
  key_points: string[];
  entities: string[];
  primary_domain: string | null;
  subdomains: string[];
  importance_score: number | null;
  importance_reason: string | null;
  evidence_chunk_ids: string[];
  run_meta: SourceFetchLlmRunMeta;
}

export interface SourceFetchRawRef {
  fetch_id: string | null;
  line_index: number | null;
  response_file: string | null;
}

export interface SourceFetchEngagementPrimary {
  name: string | null;
  value: number | null;
}

export interface SourceFetchDocument {
  document_id: string;
  run_id: string;
  source: SourceFetchSourceId;
  source_category: SourceFetchCategory;
  source_method: SourceFetchMethod;
  source_endpoint: string;
  source_item_id: string;
  doc_type: SourceFetchDocType;
  content_type: string;
  text_scope: SourceFetchTextScope;
  title: string;
  description: string | null;
  url: string;
  canonical_url: string;
  reference_url: string;
  author: string | null;
  authors: string[];
  published_at: string | null;
  updated_at: string | null;
  sort_at: string;
  time_semantics: SourceFetchTimeSemantics;
  timestamp_kind: SourceFetchTimeSemantics;
  body_text: string | null;
  summary_input_text: string;
  language: string | null;
  content_format: SourceFetchContentFormat;
  external_ids: Record<string, string>;
  related_urls: string[];
  tags: string[];
  engagement: Record<string, number | string | boolean | null>;
  engagement_primary: SourceFetchEngagementPrimary;
  discovery: SourceFetchDiscoveryProfile;
  ranking: SourceFetchRankingProfile;
  benchmark: SourceFetchBenchmarkProfile;
  reference: SourceFetchReference;
  llm: SourceFetchLlmProfile;
  metadata: Record<string, unknown>;
  raw_ref: SourceFetchRawRef;
  fetched_at: string;
}

export interface SourceFetchMetric {
  run_id: string;
  source: SourceFetchSourceId;
  source_item_id: string;
  metric_name: string;
  metric_key: string;
  metric_label: string;
  metric_unit: string | null;
  metric_kind: SourceFetchMetricKind;
  metric_value: number;
  observed_at: string;
  metadata: Record<string, unknown>;
}

export interface SourceFetchFieldAudit {
  missing: number;
  empty: number;
}

export interface SourceFetchContractReport {
  document_count: number;
  metric_count: number;
  source_count: number;
  time_semantics: Record<string, number>;
  text_scope: Record<string, number>;
  benchmark_kind: Record<string, number>;
  document_fields: Record<string, SourceFetchFieldAudit>;
  metric_fields: Record<string, SourceFetchFieldAudit>;
}

export interface SourceFetchRawItemEnvelope<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  source: SourceFetchSourceId;
  source_item_id: string;
  fetch_id: string;
  fetched_at: string;
  payload: TPayload;
}

export interface SourceFetchRunArtifacts {
  run_manifest: SourceFetchRunManifest;
  source_manifest: SourceFetchSourceManifestEntry[];
  documents: SourceFetchDocument[];
  metrics: SourceFetchMetric[];
  contract_report: SourceFetchContractReport;
}
