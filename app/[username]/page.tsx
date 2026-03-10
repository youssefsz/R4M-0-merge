import { Metadata } from "next";
import { ResumeShell } from "@/components/resume-shell";
import { GitHubApiError } from "@/lib/github";
import { getResumeData } from "@/lib/resume";

type UsernamePageProps = {
  params: Promise<{
    username: string;
  }>;
};

export async function generateMetadata({ params }: UsernamePageProps): Promise<Metadata> {
  const { username } = await params;

  return {
    title: `${username} | GitHub Resume Generator`,
    description: `Recruiter-ready resume generated from ${username}'s public GitHub activity.`,
  };
}

export default async function UsernamePage({ params }: UsernamePageProps) {
  const { username } = await params;

  try {
    const result = await getResumeData(username);
    return <ResumeShell initialUsername={result.username} initialResult={result} />;
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return <ResumeShell initialUsername={username} initialError={error.message} />;
    }

    return (
      <ResumeShell
        initialUsername={username}
        initialError="Unexpected server error while generating this resume."
      />
    );
  }
}
