import { NextRequest, NextResponse } from "next/server";
import { GitHubApiError } from "@/lib/github";
import { getResumeData } from "@/lib/resume";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: string };

    if (!body.username || body.username.trim().length === 0) {
      return NextResponse.json({ error: "GitHub username is required." }, { status: 400 });
    }

    const payload = await getResumeData(body.username);

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=900",
      },
    });
  } catch (error) {
    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          resetAt: error.resetAt,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        error: "Unexpected server error while generating resume.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
