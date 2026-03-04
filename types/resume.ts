export type RepoSummary = {
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  language: string | null;
  updatedAt: string;
  score: number;
};

export type LanguageShare = {
  language: string;
  bytes: number;
  percentage: number;
};

export type ContributionMetrics = {
  pullRequestsOpened: number;
  pullRequestsMerged: number;
  issuesOpened: number;
  externalReposContributed: number;
};

export type ActivityWindow = {
  last30Days: number;
  last90Days: number;
};

export type RawGitHubData = {
  username: string;
  displayName: string | null;
  bio: string | null;
  profileUrl: string;
  followers: number;
  following: number;
  publicRepos: number;
  createdAt: string;
  repos: RepoSummary[];
  topRepos: RepoSummary[];
  languageDistribution: LanguageShare[];
  contributionMetrics: ContributionMetrics;
  activity: ActivityWindow;
};

export type FocusArea = "Frontend" | "Backend" | "Full-stack" | "Systems / tooling";

export type AnalysisResult = {
  topLanguages: LanguageShare[];
  focusArea: FocusArea;
  consistencyLabel: "high" | "moderate" | "low";
  notableSignals: string[];
  caveats: string[];
};

export type ResumeContent = {
  headline: string;
  summary: string;
  bullets: string[];
  markdown: string;
  latex: string;
};

export type ResumeResponse = {
  username: string;
  generatedAt: string;
  raw: RawGitHubData;
  analysis: AnalysisResult;
  resume: ResumeContent;
};
