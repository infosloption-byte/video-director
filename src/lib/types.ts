export type FrameworkId =
  | "debunker"
  | "how_it_works"
  | "future_timeline"
  | "disruptor";

export type HookType =
  | "negative_warning"
  | "curiosity_gap"
  | "us_vs_them"
  | "transformation"
  | "exposing_secrets";

export type Category =
  | "Space"
  | "Energy"
  | "Biotech"
  | "AI"
  | "Hardware"
  | "Physics";

export type Visual = {
  id: string;
  url: string;
  alt: string;
  tags: string[];
  color: string;
};

export type Topic = {
  id: string;
  headline: string;
  source: string;
  category: Category;
  blurb: string;
  trendReasoning: string;
  searchDelta: number;
  rawContent: string;
  suggestedFramework: FrameworkId;
};

export type Scene = {
  sceneOrder: number;
  durationSeconds: number;
  spokenText: string;
  onScreenText: string;
  scriptReasoning: string;
  brollSearchTerm: string;
  visualReasoning: string;
  visuals: Visual[];
  selectedIndex: number;
};

export type DirectedScript = {
  selectedFramework: FrameworkId;
  frameworkReasoning: string;
  suggestedTitle: string;
  hookType: HookType;
  hookReasoning: string;
  seoCaption: string;
  firstComment: string;
  debateQuestion: string;
  keywords: string[];
  voiceDirection: string;
  scenes: Omit<Scene, "visuals" | "selectedIndex">[];
};

export type ProjectStatus = "directing" | "ready" | "error";

export type Project = {
  id: string;
  createdAt: string;
  status: ProjectStatus;
  error?: string;
  topic: Topic;
  framework: FrameworkId;
  frameworkReasoning: string;
  title: string;
  hookType: HookType;
  hookReasoning: string;
  seoCaption: string;
  firstComment: string;
  debateQuestion: string;
  keywords: string[];
  voiceDirection: string;
  voiceId: string;
  scenes: Scene[];
};

export type WordTiming = {
  word: string;
  start: number;
  end: number;
};

export type Voiceover = {
  audioUrl: string;
  duration: number;
  words: WordTiming[];
  voiceId: string;
  scriptHash: string;
};

export type ReachCheck = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
};
