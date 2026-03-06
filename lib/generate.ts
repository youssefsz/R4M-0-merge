import { AnalysisResult, RawGitHubData, ResumeContent } from "@/types/resume";

function formatLanguageList(languages: { language: string }[]): string {
  if (languages.length === 0) return "multiple languages";
  if (languages.length === 1) return languages[0].language;
  if (languages.length === 2) return `${languages[0].language} and ${languages[1].language}`;
  return `${languages[0].language}, ${languages[1].language}, and ${languages[2].language}`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function accountAgeYears(createdAt: string): number {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25)));
}

function consistencyLabel(input: AnalysisResult["consistencyLabel"]): string {
  if (input === "high") return "High";
  if (input === "moderate") return "Moderate";
  return "Low";
}

function compactAiInput(raw: RawGitHubData, analysis: AnalysisResult) {
  return {
    profile: {
      username: raw.username,
      displayName: raw.displayName,
      bio: raw.bio,
      publicRepos: raw.publicRepos,
      createdAt: raw.createdAt,
    },
    topRepos: raw.topRepos.slice(0, 5).map((repo) => ({
      fullName: repo.fullName,
      description: repo.description,
      stars: repo.stars,
      forks: repo.forks,
      openIssues: repo.openIssues,
      language: repo.language,
      updatedAt: repo.updatedAt,
    })),
    languageDistribution: raw.languageDistribution.slice(0, 6),
    contributionMetrics: raw.contributionMetrics,
    activity: raw.activity,
    analysis,
  };
}

function extractJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("OpenRouter returned empty content");
  }

  // Prefer fenced JSON block when present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    // Fall back to first JSON object-like region in case model adds prose.
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first !== -1 && last > first) {
      return JSON.parse(candidate.slice(first, last + 1)) as Record<string, unknown>;
    }
    throw new Error("OpenRouter response did not contain parseable JSON");
  }
}

function normalizeSummary(input: string): string {
  return input
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBullets(input: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const bullet of input) {
    const normalized = bullet
      .replace(/^[\s\-*•]+/, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) continue;

    const punctuated = /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
    const key = punctuated.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(punctuated);
  }

  return cleaned;
}

function hasMetricSignal(text: string): boolean {
  return /\d/.test(text);
}

/* ── Recruiter-ready bullet generation ───────────────────────────── */

function buildBullets(raw: RawGitHubData, analysis: AnalysisResult): string[] {
  const bullets: string[] = [];
  const languages = formatLanguageList(analysis.topLanguages);
  const merged = raw.contributionMetrics.pullRequestsMerged;
  const prs = raw.contributionMetrics.pullRequestsOpened;
  const issues = raw.contributionMetrics.issuesOpened;
  const external = raw.contributionMetrics.externalReposContributed;
  const topStar = raw.topRepos.length > 0 ? Math.max(...raw.topRepos.map((repo) => repo.stars)) : 0;
  const topForks = raw.topRepos.length > 0 ? Math.max(...raw.topRepos.map((repo) => repo.forks)) : 0;

  // Lead with strongest collaboration signal
  if (external >= 3 && merged > 0) {
    bullets.push(
      `Delivered ${formatNumber(merged)} merged pull requests across ${formatNumber(external)} external open-source repositories, demonstrating cross-team code review fluency in ${languages}.`,
    );
  } else if (prs > 0 && merged > 0) {
    bullets.push(
      `Authored ${formatNumber(prs)} pull requests with ${formatNumber(merged)} successfully merged, shipping production-quality ${languages} code through standard review workflows.`,
    );
  } else if (prs > 0) {
    bullets.push(
      `Opened ${formatNumber(prs)} pull requests across public projects, contributing implementation work in ${languages}.`,
    );
  } else {
    bullets.push(`Maintains actively developed public repositories with hands-on engineering in ${languages}.`);
  }

  // Community traction
  if (topStar >= 100) {
    bullets.push(
      `Built open-source tooling adopted by the community — top project reached ${formatNumber(topStar)} stars and ${formatNumber(topForks)} forks, indicating real-world usage beyond personal scope.`,
    );
  } else if (topStar >= 10) {
    bullets.push(
      `Published production-oriented repositories with up to ${formatNumber(topStar)} stars, showing iterative maintenance and visible update cadence.`,
    );
  } else if (raw.topRepos.length > 0) {
    bullets.push("Publishes and maintains public repositories with regular commits and iterative improvement.");
  }

  // Collaboration depth
  if (merged > 0 && issues > 0) {
    bullets.push(
      `Combined code contributions (${formatNumber(merged)} merged PRs) with proactive issue triage (${formatNumber(issues)} opened), reflecting end-to-end ownership from bug identification to resolution.`,
    );
  } else if (issues > 5) {
    bullets.push(
      `Opened ${formatNumber(issues)} public issues across projects, demonstrating active debugging, documentation, and cross-project collaboration.`,
    );
  }

  // Activity cadence
  if (raw.activity.last90Days >= 50) {
    bullets.push(
      `Sustained high delivery velocity with ${formatNumber(raw.activity.last30Days)} contributions in the last 30 days and ${formatNumber(raw.activity.last90Days)} over the last 90 days.`,
    );
  } else if (raw.activity.last90Days >= 15) {
    bullets.push(
      `Maintained active contribution pace with ${formatNumber(raw.activity.last90Days)} public events in the last 90 days across ${formatNumber(raw.publicRepos)} repositories.`,
    );
  } else if (raw.activity.last90Days > 0) {
    bullets.push(
      `Shows ongoing public activity with ${formatNumber(raw.activity.last90Days)} events in the last 90 days; summary prioritizes verified long-term output.`,
    );
  }

  return bullets;
}

/* ── Profile summary ─────────────────────────────────────────────── */

function buildProfileSummary(raw: RawGitHubData, analysis: AnalysisResult): string {
  const displayName = raw.displayName || raw.username;
  const years = accountAgeYears(raw.createdAt);
  const profileAgeText = years > 1 ? `${years}+ years of public GitHub history` : "a growing public GitHub presence";
  const merged = raw.contributionMetrics.pullRequestsMerged;

  const collaborationNote =
    merged > 10
      ? `, a track record of ${formatNumber(merged)} merged pull requests`
      : merged > 0
        ? `, ${formatNumber(merged)} merged pull request${merged === 1 ? "" : "s"}`
        : "";

  return `${displayName} is a ${analysis.focusArea.toLowerCase()} engineer with ${profileAgeText}${collaborationNote}, and deep technical focus on ${formatLanguageList(
    analysis.topLanguages,
  )}.${raw.bio ? ` ${raw.bio}` : ""}`;
}

/* ══════════════════════════════════════════════════════════════════
   Markdown output — ATS-friendly, recruiter-ready
   ══════════════════════════════════════════════════════════════════ */

function toMarkdown(
  raw: RawGitHubData,
  analysis: AnalysisResult,
  headline: string,
  summary: string,
  bullets: string[],
): string {
  const totalRepoStars = raw.repos.reduce((sum, repo) => sum + repo.stars, 0);
  const totalRepoForks = raw.repos.reduce((sum, repo) => sum + repo.forks, 0);
  const activeRepos90d = raw.repos.filter(
    (repo) => Date.now() - new Date(repo.updatedAt).getTime() <= 90 * 86400000,
  ).length;

  const languageRows =
    raw.languageDistribution.length > 0
      ? raw.languageDistribution
        .slice(0, 6)
        .map((lang) => `| ${lang.language} | ${lang.percentage}% |`)
        .join("\n")
      : "| — | No language data available |";

  const repoBlocks = raw.topRepos
    .slice(0, 5)
    .map((repo) => {
      const updated = new Date(repo.updatedAt).toLocaleDateString("en-US");
      const description = repo.description || "No description provided.";

      return `#### [${repo.fullName}](${repo.htmlUrl})
> ${description}

| Stars | Forks | Open Issues | Last Updated |
|------:|------:|------------:|:-------------|
| ${formatNumber(repo.stars)} | ${formatNumber(repo.forks)} | ${formatNumber(repo.openIssues)} | ${updated} |`;
    })
    .join("\n\n");

  const notableSignals =
    analysis.notableSignals.length > 0
      ? analysis.notableSignals.map((signal) => `- ${signal}`).join("\n")
      : "- No additional high-signal patterns detected beyond core metrics.";

  const caveats =
    analysis.caveats.length > 0
      ? analysis.caveats.map((caveat) => `- ${caveat}`).join("\n")
      : "- No major caveats detected from available public data.";

  return `# ${headline}

**GitHub:** [${raw.username}](${raw.profileUrl})  
**Focus:** ${analysis.focusArea} · **Consistency:** ${consistencyLabel(analysis.consistencyLabel)}  
**Generated:** ${new Date().toLocaleDateString("en-US")}

---

## Summary

${summary}

---

## Open-Source Experience

${bullets.map((b) => `- ${b}`).join("\n")}

---

## Key Metrics

| Metric | Value |
|:-------|------:|
| Public repositories | ${formatNumber(raw.publicRepos)} |
| Pull requests opened | ${formatNumber(raw.contributionMetrics.pullRequestsOpened)} |
| Pull requests merged | ${formatNumber(raw.contributionMetrics.pullRequestsMerged)} |
| Issues opened | ${formatNumber(raw.contributionMetrics.issuesOpened)} |
| External repos contributed | ${formatNumber(raw.contributionMetrics.externalReposContributed)} |
| Total stars (all repos) | ${formatNumber(totalRepoStars)} |
| Total forks (all repos) | ${formatNumber(totalRepoForks)} |
| Active repos (last 90 days) | ${formatNumber(activeRepos90d)} |

---

## Technical Focus

| Language | Share |
|:---------|------:|
${languageRows}

---

## Activity

| Window | Events |
|:-------|-------:|
| Last 30 days | ${formatNumber(raw.activity.last30Days)} |
| Last 90 days | ${formatNumber(raw.activity.last90Days)} |

---

## Selected Projects

${repoBlocks || "*No public repositories available.*"}

---

## Additional Signals

${notableSignals}

## Notes

${caveats}
`;
}

/* ══════════════════════════════════════════════════════════════════
   LaTeX output — professional single-page resume, ATS-optimised
   ══════════════════════════════════════════════════════════════════ */

function escapeLatex(input: string): string {
  return input
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function toLatex(
  raw: RawGitHubData,
  analysis: AnalysisResult,
  headline: string,
  summary: string,
  bullets: string[],
) {
  const totalRepoStars = raw.repos.reduce((sum, repo) => sum + repo.stars, 0);
  const activeRepos90d = raw.repos.filter(
    (repo) => Date.now() - new Date(repo.updatedAt).getTime() <= 90 * 86400000,
  ).length;

  const languageItems =
    raw.languageDistribution.length > 0
      ? raw.languageDistribution
        .slice(0, 6)
        .map((lang) => `${escapeLatex(lang.language)} (${lang.percentage}\\%)`)
        .join(" \\textbullet{} ")
      : "No language data available.";

  const repoBlocks = raw.topRepos
    .slice(0, 4)
    .map((repo) => {
      const description = repo.description ? escapeLatex(repo.description) : "No description provided.";

      return `\\resumeProject{${escapeLatex(repo.fullName)}}{${escapeLatex(repo.htmlUrl)}}{${formatNumber(repo.stars)} stars, ${formatNumber(repo.forks)} forks}
  {${description}}`;
    })
    .join("\n\n");

  const notableItems =
    analysis.notableSignals.length > 0
      ? analysis.notableSignals.map((signal) => `\\item ${escapeLatex(signal)}`).join("\n")
      : "\\item No additional high-signal patterns detected beyond core metrics.";

  const displayName = escapeLatex(raw.displayName || raw.username);
  const profileUrl = escapeLatex(raw.profileUrl);
  const dateStr = escapeLatex(new Date().toLocaleDateString("en-US"));

  return `\\documentclass[letterpaper,10pt]{article}

%% ── Packages ──────────────────────────────────────────────────────
\\usepackage[margin=0.55in]{geometry}
\\usepackage[hidelinks]{hyperref}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{xcolor}
\\usepackage{tabularx}

%% ── Colours ───────────────────────────────────────────────────────
\\definecolor{heading}{HTML}{1a1a1a}
\\definecolor{subtext}{HTML}{555555}
\\definecolor{linkblue}{HTML}{2563EB}

%% ── Layout tuning ─────────────────────────────────────────────────
\\setlength{\\parskip}{0pt}
\\setlength{\\parindent}{0pt}
\\pagenumbering{gobble}
\\pagestyle{empty}

\\titleformat{\\section}{\\large\\bfseries\\color{heading}}{}{0em}{}[\\vspace{-0.6em}\\textcolor{subtext}{\\rule{\\linewidth}{0.4pt}}]
\\titlespacing*{\\section}{0pt}{0.6em}{0.35em}

%% ── Custom commands ───────────────────────────────────────────────
\\newcommand{\\resumeProject}[4]{%
  \\textbf{#1} \\hfill {\\small\\color{subtext} #3}\\\\
  {\\small\\color{linkblue}\\href{#2}{#2}}\\\\
  {\\small #4}\\vspace{0.35em}
}

\\begin{document}

%% ═══════════════════════════════════════════════════════════════════
%%  Header
%% ═══════════════════════════════════════════════════════════════════
\\begin{center}
  {\\LARGE\\bfseries ${displayName}}\\\\[0.3em]
  {\\color{linkblue}\\href{${profileUrl}}{GitHub Profile}}
  \\quad|\\quad ${escapeLatex(analysis.focusArea)} Engineer
  \\quad|\\quad Generated ${dateStr}
\\end{center}

\\vspace{0.2em}

%% ═══════════════════════════════════════════════════════════════════
%%  Summary
%% ═══════════════════════════════════════════════════════════════════
\\section*{Summary}
${escapeLatex(summary)}

%% ═══════════════════════════════════════════════════════════════════
%%  Open-Source Experience
%% ═══════════════════════════════════════════════════════════════════
\\section*{Open-Source Experience}
\\begin{itemize}[leftmargin=1.4em, nosep, itemsep=0.3em]
${bullets.map((bullet) => `  \\item ${escapeLatex(bullet)}`).join("\n")}
\\end{itemize}

%% ═══════════════════════════════════════════════════════════════════
%%  Key Metrics
%% ═══════════════════════════════════════════════════════════════════
\\section*{Key Metrics}
\\begin{tabularx}{\\textwidth}{Xr@{\\hspace{2.5em}}Xr}
  Public repositories & ${formatNumber(raw.publicRepos)} & PRs opened & ${formatNumber(raw.contributionMetrics.pullRequestsOpened)} \\\\
  PRs merged & ${formatNumber(raw.contributionMetrics.pullRequestsMerged)} & Issues opened & ${formatNumber(raw.contributionMetrics.issuesOpened)} \\\\
  External contributions & ${formatNumber(raw.contributionMetrics.externalReposContributed)} & Total stars & ${formatNumber(totalRepoStars)} \\\\
  Active repos (90d) & ${formatNumber(activeRepos90d)} & Events (90d) & ${formatNumber(raw.activity.last90Days)} \\\\
\\end{tabularx}

%% ═══════════════════════════════════════════════════════════════════
%%  Technical Skills
%% ═══════════════════════════════════════════════════════════════════
\\section*{Technical Skills}
\\textbf{Languages:} ${languageItems}\\\\[0.2em]
\\textbf{Focus area:} ${escapeLatex(analysis.focusArea)} \\quad|\\quad \\textbf{Consistency:} ${consistencyLabel(analysis.consistencyLabel)}

%% ═══════════════════════════════════════════════════════════════════
%%  Selected Projects
%% ═══════════════════════════════════════════════════════════════════
\\section*{Selected Projects}
${repoBlocks || "No public repositories available."}

%% ═══════════════════════════════════════════════════════════════════
%%  Additional Signals
%% ═══════════════════════════════════════════════════════════════════
\\section*{Additional Signals}
\\begin{itemize}[leftmargin=1.4em, nosep, itemsep=0.2em]
${notableItems}
\\end{itemize}

\\end{document}
`;
}

export async function generateResume(raw: RawGitHubData, analysis: AnalysisResult): Promise<ResumeContent> {
  const displayName = raw.displayName || raw.username;
  const headline = `${displayName} - GitHub Impact Summary`;

  let summary = "";
  let bullets: string[] = [];

  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const preferredModel = process.env.OPENROUTER_MODEL?.trim();
  const modelCandidates = Array.from(
    new Set(
      [
        preferredModel,
        "google/gemini-2.0-flash-lite-preview-02-05:free",
        "stepfun/step-3.5-flash:free",
      ].filter((model): model is string => Boolean(model)),
    ),
  );

  if (openRouterApiKey) {
    console.log("[generateResume] Attempting OpenRouter API call for:", displayName);
    try {
      const prompt = `You are an elite technical recruiter and resume writer.

Using the GitHub profile snapshot below, return:
- "summary": one paragraph
- "bullets": 4 to 5 resume bullets emphasizing measurable outcomes, collaboration, technologies, and consistency

Output requirements:
- Return valid JSON only.
- Use exactly: {"summary":"...","bullets":["..."]}.
- Do not include markdown fences.
- Do not invent metrics. Use only numbers present in the provided data.
- Avoid generic language ("hardworking", "passionate", "responsible for").
- Start each bullet with a strong action verb and keep each bullet under 30 words.

GitHub profile snapshot:
${JSON.stringify(compactAiInput(raw, analysis), null, 2)}`;

      let lastError: Error | null = null;

      for (const model of modelCandidates) {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openRouterApiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
            "X-Title": "GitHub Username Resume Generator",
          },
          body: JSON.stringify({
            model,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          lastError = new Error(`OpenRouter API error (${model}): ${response.status} ${response.statusText} — ${body}`);
          console.warn(lastError.message);
          continue;
        }

        const json = await response.json();

        if (json.usage) {
          console.log("[generateResume] Model:", model, "tokens:", json.usage.total_tokens);
        }

        const messageContent = json.choices?.[0]?.message?.content;
        const content =
          typeof messageContent === "string"
            ? messageContent
            : Array.isArray(messageContent)
              ? messageContent.map((part: { text?: string }) => part.text || "").join("")
              : "";
        const parsed = extractJsonObject(content);

        const aiSummary = parsed.summary;
        const aiBullets = parsed.bullets;

        if (typeof aiSummary === "string" && Array.isArray(aiBullets)) {
          const normalizedAiSummary = normalizeSummary(aiSummary);
          const normalizedAiBullets = normalizeBullets(aiBullets.filter((item): item is string => typeof item === "string"));
          const fallbackBullets = buildBullets(raw, analysis);

          let mergedBullets = [...normalizedAiBullets];
          if (mergedBullets.length < 4) {
            mergedBullets = normalizeBullets([...mergedBullets, ...fallbackBullets]);
          }

          if (mergedBullets.filter(hasMetricSignal).length < 2) {
            mergedBullets = normalizeBullets([...mergedBullets, ...fallbackBullets]);
          }

          if (normalizedAiSummary.length >= 40 && mergedBullets.length >= 3) {
            summary = normalizedAiSummary;
            bullets = mergedBullets.slice(0, 5);
            break;
          }
        }

        lastError = new Error(`OpenRouter response format invalid for model ${model}`);
      }

      if (!summary || bullets.length === 0) {
        throw lastError || new Error("OpenRouter did not return valid content");
      }
    } catch (e) {
      console.error("Failed to generate with OpenRouter, falling back to basic generation:", e);
      summary = buildProfileSummary(raw, analysis);
      bullets = buildBullets(raw, analysis);
    }
  } else {
    summary = buildProfileSummary(raw, analysis);
    bullets = buildBullets(raw, analysis);
  }

  return {
    headline,
    summary,
    bullets,
    markdown: toMarkdown(raw, analysis, headline, summary, bullets),
    latex: toLatex(raw, analysis, headline, summary, bullets),
  };
}
