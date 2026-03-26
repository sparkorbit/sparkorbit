export type SessionDocumentBenchmark = Record<string, unknown> & {
  kind: string | null;
  board_id: string | null;
  board_name: string | null;
  snapshot_at: string | null;
  rank: number | string | null;
  score_label: string | null;
  score_value: number | string | null;
  score_unit: string | null;
  votes: number | string | null;
  model_name: string | null;
  organization: string | null;
  total_models: number | string | null;
  total_votes: number | string | null;
};

export type SessionDocumentReference = Record<string, unknown> & {
  source_label: string | null;
  display_title: string | null;
  display_url: string | null;
  snippet: string | null;
};

export type SessionDocumentLlm = Record<string, unknown> & {
  status: string;
  summary_1l: string | null;
  summary_short: string | null;
  key_points: string[];
  entities: string[];
  primary_domain: string | null;
  subdomains: string[];
  importance_score: number | string | null;
  importance_reason: string | null;
  evidence_chunk_ids: string[];
  run_meta: {
    model_name: string | null;
    prompt_version: string | null;
    fewshot_pack_version: string | null;
    generated_at: string | null;
  };
};

export type SessionDocumentDisplayTime = {
  label: string | null;
  value: string | null;
  field: string | null;
  semantics: string | null;
};

export type SessionDocument = {
  document_id: string;
  run_id: string;
  source: string;
  source_category: string;
  source_method: string;
  source_endpoint: string | null;
  source_item_id: string;
  doc_type: string;
  content_type: string;
  text_scope: string;
  title: string;
  description: string | null;
  url: string | null;
  canonical_url: string | null;
  reference_url: string | null;
  author: string | null;
  authors: string[];
  published_at: string | null;
  updated_at: string | null;
  sort_at: string | null;
  time_semantics: string;
  timestamp_kind: string;
  body_text: string | null;
  summary_input_text: string | null;
  language: string | null;
  content_format: string | null;
  external_ids: Record<string, string | number | boolean | null>;
  related_urls: string[];
  tags: string[];
  engagement: Record<string, number | string | boolean | null>;
  engagement_primary: {
    name: string | null;
    value: number | null;
  };
  discovery: Record<string, unknown> & {
    spark_score: number | string | null;
    primary_reason?: string | null;
  };
  ranking: Record<string, unknown> & {
    feed_score: number | string | null;
    priority_reason?: string | null;
  };
  benchmark: SessionDocumentBenchmark;
  display_time: SessionDocumentDisplayTime;
  reference: SessionDocumentReference;
  llm: SessionDocumentLlm;
  metadata: Record<string, unknown>;
  raw_ref: Record<string, unknown>;
  fetched_at: string | null;
};
