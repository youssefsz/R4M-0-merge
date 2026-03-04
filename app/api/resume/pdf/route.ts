import { NextRequest, NextResponse } from "next/server";
import { markdownToPdf } from "@/lib/pdf";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { markdown?: string; username?: string };

    if (!body.markdown || body.markdown.trim().length === 0) {
      return NextResponse.json({ error: "Markdown content is required." }, { status: 400 });
    }

    const pdfBytes = await markdownToPdf(body.markdown);
    const safeName = (body.username?.trim() || "github-user").replace(/[^a-zA-Z0-9_-]/g, "");

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}-resume.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Failed to generate PDF export.",
        code: "PDF_GENERATION_FAILED",
      },
      { status: 500 },
    );
  }
}
