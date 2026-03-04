import { RawGitHubData, RepoSummary } from "@/types/resume";

type GitHubUser = {
  login: string;
  name: string | null;
  bio: string | null;
  html_url: string;
  followers: number;
  following: number;
  public_repos: number;
  created_at: string;
};

type GitHubRepo = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  updated_at: string;
  languages_url: string;
  owner: {
    login: string;
  };
};

type SearchResponse<T> = {
  total_count: number;
  incomplete_results: boolean;
  items: T[];
};

type IssueSearchItem = {
  repository_url: string;
};

type PublicEvent = {
  created_at: string;
};

const GITHUB_API_URL = "https://api.github.com";

export class GitHubApiError extends Error {
  status: number;
  code: string;
  resetAt?: string;

  constructor(message: string, status: number, code: string, resetAt?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.resetAt = resetAt;
  }
}

const githubHeaders = () => {
  const token = process.env.GITHUB_TOKEN;

  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const validateUsername = (username: string) => {
  const cleaned = username.trim().replace(/^@/, "");
  const regex = /^(?!-)(?!.*--)[A-Za-z0-9-]{1,39}(?<!-)$/;

  if (!regex.test(cleaned)) {
    throw new GitHubApiError("Invalid GitHub username format.", 400, "INVALID_USERNAME");
  }

  return cleaned;
};

async function githubRequest<T>(
  path: string,
  opts?: { revalidate?: number },
): Promise<T> {
  const res = await fetch(`${GITHUB_API_URL}${path}`, {
    headers: githubHeaders(),
    next: { revalidate: opts?.revalidate ?? 900 },
  });

  if (!res.ok) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    const resetEpoch = res.headers.get("x-ratelimit-reset");
    const resetAt = resetEpoch ? new Date(Number(resetEpoch) * 1000).toISOString() : undefined;

    if (res.status === 404) {
      throw new GitHubApiError("GitHub user not found.", 404, "NOT_FOUND");
    }

    if (res.status === 403 && remaining === "0") {
      throw new GitHubApiError(
        "GitHub API rate limit exceeded. Please try again later.",
        429,
        "RATE_LIMITED",
        resetAt,
      );
    }

    throw new GitHubApiError(
      `GitHub API request failed with status ${res.status}.`,
      res.status,
      "GITHUB_API_ERROR",
      resetAt,
    );
  }

  return res.json() as Promise<T>;
}

const scoreRepo = (repo: GitHubRepo): number => {
  const updatedDaysAgo = (Date.now() - new Date(repo.updated_at).getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 90 - Math.min(updatedDaysAgo, 90));
  return repo.stargazers_count * 2 + repo.forks_count * 1.5 + recencyScore;
};

const toRepoSummary = (repo: GitHubRepo): RepoSummary => ({
  name: repo.name,
  fullName: repo.full_name,
  htmlUrl: repo.html_url,
  description: repo.description,
  stars: repo.stargazers_count,
  forks: repo.forks_count,
  openIssues: repo.open_issues_count,
  language: repo.language,
  updatedAt: repo.updated_at,
  score: scoreRepo(repo),
});

async function fetchRepoLanguageBytes(repos: GitHubRepo[]) {
  const topCandidates = repos.slice(0, 8);

  const maps = await Promise.all(
    topCandidates.map((repo) =>
      githubRequest<Record<string, number>>(new URL(repo.languages_url).pathname, {
        revalidate: 3600,
      }).catch(() => ({})),
    ),
  );

  const totals: Record<string, number> = {};

  for (const langMap of maps) {
    for (const [language, bytes] of Object.entries(langMap)) {
      totals[language] = (totals[language] ?? 0) + bytes;
    }
  }

  return totals;
}

async function fetchRecentEvents(username: string) {
  const pages = [1, 2, 3];
  const responses = await Promise.all(
    pages.map((page) =>
      githubRequest<PublicEvent[]>(`/users/${username}/events/public?per_page=100&page=${page}`, {
        revalidate: 300,
      }).catch(() => []),
    ),
  );

  return responses.flat();
}

export async function collectGitHubData(inputUsername: string): Promise<RawGitHubData> {
  const username = validateUsername(inputUsername);

  const user = await githubRequest<GitHubUser>(`/users/${username}`, { revalidate: 900 });
  const repos = await githubRequest<GitHubRepo[]>(
    `/users/${username}/repos?per_page=100&sort=updated&type=owner`,
    { revalidate: 900 },
  );

  const repoSummaries = repos.map(toRepoSummary);
  const topRepos = [...repoSummaries]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const languageBytes = await fetchRepoLanguageBytes(repos);
  const totalBytes = Object.values(languageBytes).reduce((sum, value) => sum + value, 0);
  const languageDistribution = Object.entries(languageBytes)
    .map(([language, bytes]) => ({
      language,
      bytes,
      percentage: totalBytes > 0 ? Number(((bytes / totalBytes) * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10);

  const [prsOpened, prsMerged, issuesOpened, prItems, events] = await Promise.all([
    githubRequest<SearchResponse<unknown>>(`/search/issues?q=type:pr+author:${username}&per_page=1`, {
      revalidate: 1800,
    }),
    githubRequest<SearchResponse<unknown>>(
      `/search/issues?q=type:pr+author:${username}+is:merged&per_page=1`,
      { revalidate: 1800 },
    ),
    githubRequest<SearchResponse<unknown>>(`/search/issues?q=type:issue+author:${username}&per_page=1`, {
      revalidate: 1800,
    }),
    githubRequest<SearchResponse<IssueSearchItem>>(
      `/search/issues?q=type:pr+author:${username}&per_page=100&sort=updated&order=desc`,
      { revalidate: 1800 },
    ),
    fetchRecentEvents(username),
  ]);

  const externalReposSet = new Set<string>();
  for (const item of prItems.items) {
    const repoPath = item.repository_url.replace(`${GITHUB_API_URL}/repos/`, "");
    const owner = repoPath.split("/")[0]?.toLowerCase();
    if (owner && owner !== username.toLowerCase()) {
      externalReposSet.add(repoPath);
    }
  }

  const now = Date.now();
  const d30 = 30 * 24 * 60 * 60 * 1000;
  const d90 = 90 * 24 * 60 * 60 * 1000;
  let last30Days = 0;
  let last90Days = 0;

  for (const event of events) {
    const age = now - new Date(event.created_at).getTime();
    if (age <= d90) {
      last90Days += 1;
      if (age <= d30) {
        last30Days += 1;
      }
    }
  }

  return {
    username: user.login,
    displayName: user.name,
    bio: user.bio,
    profileUrl: user.html_url,
    followers: user.followers,
    following: user.following,
    publicRepos: user.public_repos,
    createdAt: user.created_at,
    repos: repoSummaries,
    topRepos,
    languageDistribution,
    contributionMetrics: {
      pullRequestsOpened: prsOpened.total_count,
      pullRequestsMerged: prsMerged.total_count,
      issuesOpened: issuesOpened.total_count,
      externalReposContributed: externalReposSet.size,
    },
    activity: {
      last30Days,
      last90Days,
    },
  };
}
