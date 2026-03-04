import { AnalysisResult, FocusArea, RawGitHubData } from "@/types/resume";

const FRONTEND_LANGS = new Set(["TypeScript", "JavaScript", "HTML", "CSS", "Vue", "Svelte"]);
const BACKEND_LANGS = new Set(["Python", "Go", "Java", "C#", "Ruby", "PHP", "Kotlin"]);
const SYSTEMS_LANGS = new Set(["Rust", "C", "C++", "Zig"]);

function detectFocusArea(data: RawGitHubData): FocusArea {
  const langScores = new Map<string, number>();

  for (const lang of data.languageDistribution) {
    langScores.set(lang.language, lang.percentage);
  }

  let frontend = 0;
  let backend = 0;
  let systems = 0;

  for (const [language, score] of langScores.entries()) {
    if (FRONTEND_LANGS.has(language)) frontend += score;
    if (BACKEND_LANGS.has(language)) backend += score;
    if (SYSTEMS_LANGS.has(language)) systems += score;
  }

  const hasBalancedWeb = frontend >= 20 && backend >= 20;

  if (systems >= 35) return "Systems / tooling";
  if (hasBalancedWeb) return "Full-stack";
  if (frontend >= backend) return "Frontend";
  return "Backend";
}

function consistencyFromActivity(last90: number): "high" | "moderate" | "low" {
  if (last90 >= 80) return "high";
  if (last90 >= 25) return "moderate";
  return "low";
}

export function analyzeGitHubData(data: RawGitHubData): AnalysisResult {
  const topLanguages = data.languageDistribution.slice(0, 3);
  const focusArea = detectFocusArea(data);
  const consistencyLabel = consistencyFromActivity(data.activity.last90Days);

  const notableSignals: string[] = [];
  const caveats: string[] = [];

  if (data.topRepos.some((repo) => repo.stars >= 100)) {
    const maxStars = Math.max(...data.topRepos.map((repo) => repo.stars));
    notableSignals.push(`Built at least one repository with ${maxStars}+ stars.`);
  }

  if (data.contributionMetrics.externalReposContributed >= 5) {
    notableSignals.push(
      `Contributed code changes across ${data.contributionMetrics.externalReposContributed} external repositories.`,
    );
  }

  if (data.contributionMetrics.pullRequestsMerged > 0) {
    notableSignals.push(
      `${data.contributionMetrics.pullRequestsMerged} merged pull requests indicate accepted, review-passing contributions.`,
    );
  }

  if (data.publicRepos === 0 || data.repos.length === 0) {
    caveats.push("Limited public repository data available.");
  }

  if (data.activity.last90Days < 10) {
    caveats.push("Recent activity is light, so this summary emphasizes verified historical output.");
  }

  return {
    topLanguages,
    focusArea,
    consistencyLabel,
    notableSignals,
    caveats,
  };
}
