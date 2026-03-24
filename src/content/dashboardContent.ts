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
  domain: string;
  headline: string;
  summary: string;
  evidence: string;
};

export type FeedItem = {
  source: string;
  type: string;
  title: string;
  meta: string;
  note: string;
};

export type FeedPanel = {
  id: string;
  title: string;
  eyebrow: string;
  sourceNote: string;
  items: FeedItem[];
};

export type AskPrompt = {
  question: string;
  grounding: string;
};

export type ReferenceItem = {
  title: string;
  source: string;
  note: string;
};

export type EvidenceStep = {
  step: string;
  title: string;
  detail: string;
};

export const dashboardContent = {
  brand: {
    name: "SparkOrbit",
    tagline: "AI·테크 인텔리전스를 위한 오픈 월드 에이전트",
  },
  session: {
    title: "세션 / 런타임",
    sessionId: "session_2026_03_23_ai-tech",
    sessionDate: "2026-03-23",
    window: "24시간",
    reloadRule: "화면을 비우거나 날짜가 바뀌면 동일한 환경을 다시 로드합니다.",
    metrics: [
      {
        label: "병렬 레인",
        value: "7",
        note: "요약, 커뮤니티, 논문, 기업 / 릴리즈, 오픈소스, 벤치마크, 질문 / 에이전트",
      },
      {
        label: "LLM 계층",
        value: "4",
        note: "문서, 이벤트, 도메인, 전역 다이제스트",
      },
      {
        label: "피드 혼합",
        value: "0",
        note: "원본 소스 피드는 분리된 상태를 유지합니다",
      },
    ] satisfies SessionMetric[],
    runtime: [
      {
        name: "collector",
        role: "앱 시작 시 소스 어댑터가 원문 문서를 수집합니다",
        status: "시작 실행",
      },
      {
        name: "enricher",
        role: "문서 상위 계층에서 요약, 클러스터, 다이제스트를 생성합니다",
        status: "고반응 항목만",
      },
      {
        name: "redis",
        role: "세션 상태 저장소이며 장기 아카이브는 아닙니다",
        status: "활성 세션",
      },
      {
        name: "ui",
        role: "요약 레인과 소스 레인을 함께 보여줍니다",
        status: "현재 화면",
      },
    ] satisfies RuntimeItem[],
    rules: [
      "무료이며 인증이 필요 없는 소스를 우선합니다.",
      "교차 소스 그룹핑은 다이제스트 / 클러스터 계층에서만 수행합니다.",
      "화면에는 원본 참조가 그대로 유지되어야 합니다.",
    ],
  },
  summary: {
    title: "요약 레인",
    headline:
      "도메인 다이제스트가 상단에 놓이고, 사용자는 아래로 내려가며 소스별 근거를 확인합니다.",
    digests: [
      {
        domain: "모델",
        headline: "오픈 모델 출시와 리더보드 변동이 가장 강한 클러스터 테마입니다.",
        summary:
          "사용자가 벤치마크 행이나 저장소 릴리즈를 보기 전에 무엇이 바뀌었는지 도메인 다이제스트 카드로 먼저 설명합니다.",
        evidence: "다이제스트 + 클러스터 요약",
      },
      {
        domain: "연구",
        headline: "같은 주제를 다이제스트가 강조하더라도 논문 활동은 자체 레인으로 보여야 합니다.",
        summary:
          "연구는 원본 논문 피드 아이템으로 읽히는 상태를 유지한 채, 이후 이벤트와 도메인 요약으로 연결되어야 합니다.",
        evidence: "arXiv / HF 논문",
      },
      {
        domain: "기업",
        headline: "공식 릴리즈 포스트는 커뮤니티 해석과 다른 층위로 읽혀야 합니다.",
        summary:
          "공식 채널은 소스 오브 트루스로 남아 있어야 하며, 요약 계층이 그 위에서 커뮤니티와 벤치마크 흐름을 연결해야 합니다.",
        evidence: "릴리즈 노트 / RSS",
      },
    ] satisfies DigestItem[],
  },
  feeds: [
    {
      id: "community",
      title: "SNS / 커뮤니티 레인",
      eyebrow: "반응 스트림",
      sourceNote: "Reddit, HN, GitHub",
      items: [
        {
          source: "Hacker News",
          type: "토론",
          title: "토론 스레드는 논문, 저장소, 공식 출시로 이어지는 링크 허브 역할을 합니다.",
          meta: "API 피드",
          note: "관심도와 논쟁 흐름 추적에 유용합니다.",
        },
        {
          source: "Reddit",
          type: "커뮤니티 글",
          title: "서브레딧 반응은 혼란, 실사용 테스트, 정서를 초기에 드러냅니다.",
          meta: ".json / 선택적 인증",
          note: "주요 근거보다는 사회적 신호로 유용합니다.",
        },
        {
          source: "GitHub",
          type: "개발자 움직임",
          title: "스타 수와 업데이트 시점은 관심이 실제 사용으로 이어지는지 설명하는 데 도움이 됩니다.",
          meta: "REST API",
          note: "오픈소스 레인의 릴리즈 중심 흐름과는 분리해 유지합니다.",
        },
      ],
    },
    {
      id: "papers",
      title: "논문 레인",
      eyebrow: "연구 뷰",
      sourceNote: "arXiv, HF Daily Papers, HF Trending",
      items: [
        {
          source: "arXiv",
          type: "논문",
          title: "새 논문은 교차 소스 클러스터링 이전에 원본 피드 아이템으로 먼저 나타나야 합니다.",
          meta: "RSS + API",
          note: "기본 연구 레인 소스입니다.",
        },
        {
          source: "HF Daily Papers",
          type: "큐레이션 연구",
          title: "큐레이션된 논문 선정은 어떤 연구 흐름이 가속되는지 드러내는 데 도움이 됩니다.",
          meta: "API",
          note: "커뮤니티 관심과 연결되지만 섞이지는 않습니다.",
        },
        {
          source: "HF Models / Trending",
          type: "모델 흐름",
          title: "트렌딩 모델은 논문의 주장과 생태계의 즉각적인 관심을 연결합니다.",
          meta: "API",
          note: "출시 시점 근접성과 태그 확인에 유용합니다.",
        },
      ],
    },
    {
      id: "company",
      title: "기업 / 릴리즈 레인",
      eyebrow: "공식 채널",
      sourceNote: "OpenAI, Google AI Blog, Anthropic, DeepMind",
      items: [
        {
          source: "OpenAI",
          type: "공식 릴리즈",
          title: "공식 제품 및 연구 포스트는 출시 관련 클러스터의 기준점이 됩니다.",
          meta: "RSS 우선",
          note: "추정성 코멘터리보다 우선합니다.",
        },
        {
          source: "Google AI Blog",
          type: "연구 포스트",
          title: "연구 블로그는 나중에 요약 테마로 묶이더라도 자체 공식 소스로 남아야 합니다.",
          meta: "RSS 우선",
          note: "원본 소스 레인의 역할을 유지합니다.",
        },
        {
          source: "Anthropic / DeepMind",
          type: "보조 채널",
          title: "스크래핑 기반 공식 페이지도 여기에 속하지만, 수집 확실성은 계속 보여야 합니다.",
          meta: "스크래핑 보조",
          note: "수집 방식은 신뢰도에 영향을 줍니다.",
        },
      ],
    },
    {
      id: "opensource",
      title: "오픈소스 레인",
      eyebrow: "저장소 흐름",
      sourceNote: "GitHub 릴리즈와 저장소 변화",
      items: [
        {
          source: "GitHub Releases",
          type: "릴리즈 노트",
          title: "릴리즈 노트는 도구나 모델이 실제로 배포 가능한 상태인지 보여주는 가장 분명한 신호입니다.",
          meta: "REST API",
          note: "주장을 실제 산출물과 연결합니다.",
        },
        {
          source: "Repo activity",
          type: "저장소 변화",
          title: "updated_at, stars, 유지보수 움직임은 기업 블로그와 별개로 생태계 모멘텀을 보여줍니다.",
          meta: "저장소 메타데이터",
          note: "OSS와 인프라 흐름에 유용합니다.",
        },
        {
          source: "Infrastructure Repos",
          type: "스택 흐름",
          title: "인프라 도구는 모델 출시와 별개로 움직이더라도 화면에서 중요한 의미를 가질 수 있습니다.",
          meta: "소스 피드",
          note: "릴리즈 레인의 의미 체계에 억지로 맞출 필요는 없습니다.",
        },
      ],
    },
    {
      id: "benchmark",
      title: "벤치마크 레인",
      eyebrow: "비교 뷰",
      sourceNote: "LMArena, Open LLM Leaderboard",
      items: [
        {
          source: "LMArena",
          type: "리더보드 스냅샷",
          title: "순위 변화는 빠르게 관심을 끌지만, 스크래핑 한계도 함께 보여야 합니다.",
          meta: "보조 스크래핑",
          note: "관심도는 높고 수집 확실성은 중간입니다.",
        },
        {
          source: "Open LLM Leaderboard",
          type: "구조화 벤치마크",
          title: "구조화된 벤치마크 테이블은 더 안정적인 비교 카드를 제공합니다.",
          meta: "HF datasets API",
          note: "반복 가능한 스냅샷 표시에 적합합니다.",
        },
        {
          source: "벤치마크 주의점",
          type: "주의",
          title: "수치는 메트릭 경계와 평가 한계 설명 옆에 배치되어야 합니다.",
          meta: "벤치마크 요약",
          note: "문서에서도 이를 명시적으로 요구합니다.",
        },
      ],
    },
  ] satisfies FeedPanel[],
  ask: {
    title: "질문 / 에이전트 레인",
    description:
      "후속 질문은 현재 보이는 다이제스트, 클러스터, 소스 문서에 근거해야 합니다.",
    prompts: [
      {
        question: "현재 모델 흐름에서 이 벤치마크 변동이 왜 중요한가요?",
        grounding: "다이제스트 + 벤치마크 스냅샷 + 릴리즈 노트",
      },
      {
        question: "이 주장을 뒷받침하는 공식 포스트와 저장소 업데이트는 무엇인가요?",
        grounding: "클러스터 멤버 + 원문 URL",
      },
      {
        question: "이 논문 클러스터는 세션 간 무엇이 달라졌나요?",
        grounding: "문서 요약 + 세션 날짜",
      },
    ] satisfies AskPrompt[],
    references: [
      {
        title: "도메인 다이제스트 / 모델 / 24시간",
        source: "다이제스트",
        note: "상호작용 경로를 시작하는 최상단 카드",
      },
      {
        title: "클러스터 요약 / 출시 스레드",
        source: "클러스터 요약",
        note: "후속 질문을 위한 이벤트 단위 그룹",
      },
      {
        title: "문서 요약 / 공식 릴리즈 노트",
        source: "문서 요약",
        note: "참조 경로가 붙은 근거 기반 짧은 답변",
      },
    ] satisfies ReferenceItem[],
  },
  evidence: {
    title: "드릴다운 / 근거",
    description:
      "홈 화면만 봐도 사용자가 요약에서 증거로 어떻게 내려가는지 보여야 하며, 그 경로를 다른 페이지 타입 뒤에 숨기면 안 됩니다.",
    steps: [
      {
        step: "01",
        title: "다이제스트",
        detail: "도메인 헤드라인, 짧은 다이제스트, 핵심 변화",
      },
      {
        step: "02",
        title: "클러스터",
        detail: "그룹화된 소스 멤버가 붙은 주제 / 이벤트 요약",
      },
      {
        step: "03",
        title: "문서",
        detail: "문서 요약, 메타데이터, 소스 식별자",
      },
      {
        step: "04",
        title: "원문 URL",
        detail: "최종 참조 및 검증 경로",
      },
    ] satisfies EvidenceStep[],
    references: [
      {
        title: "요약_근거",
        source: "청크 연결",
        note: "요약과 근거 청크를 연결합니다",
      },
      {
        title: "클러스터_멤버",
        source: "문서 조인",
        note: "어떤 소스 문서가 이벤트에 속하는지 보여줍니다",
      },
      {
        title: "문서 / 원문 URL",
        source: "1차 참조",
        note: "요약이 원문을 대체하지 않도록 보장합니다",
      },
    ] satisfies ReferenceItem[],
  },
} as const;
