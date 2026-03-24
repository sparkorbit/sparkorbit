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
  };
  ranking: Record<string, unknown> & {
    feed_score: number | string | null;
  };
  benchmark: Record<string, unknown>;
  reference: Record<string, unknown> & {
    display_url: string | null;
    snippet: string | null;
  };
  llm: Record<string, unknown> & {
    status: string;
    summary_short: string | null;
    importance_score: number | string | null;
  };
  metadata: Record<string, unknown>;
  raw_ref: Record<string, unknown>;
  fetched_at: string | null;
};
