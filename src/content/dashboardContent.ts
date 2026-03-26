export type SessionMetric = {
  label: string;
  value: string;
  note: string;
};

export type RuntimeItem = {
  name: string;
  role: string;
  status: string;
};

export type DigestItem = {
  id: string;
  domain: string;
  headline: string;
  summary: string;
  evidence: string;
};

export type FeedItem = {
  documentId: string;
  referenceUrl: string;
  paperDomain?: string | null;
  timestamp: string | null;
  timestampLabel?: string | null;
  source: string;
  type: string;
  title: string;
  meta: string;
  note: string;
  engagementLabel?: string;
  feedScore?: number | null;
};

export type FeedPanel = {
  id: string;
  title: string;
  eyebrow: string;
  sourceNote: string;
  items: FeedItem[];
};
