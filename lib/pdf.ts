import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/* ── Text-processing helpers ─────────────────────────────────────── */

const wrapLine = (line: string, maxChars = 95) => {
  if (line.length <= maxChars) return [line];

  const words = line.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
};

const normalizeMarkdownLine = (line: string): string => {
  return line
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1");
};

const sanitizePdfText = (input: string): string => {
  return input
    .normalize("NFKD")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[•]/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
};

/* ── Colour palette for the PDF ──────────────────────────────────── */

const COLORS = {
  heading: rgb(0.09, 0.09, 0.12),
  body: rgb(0.14, 0.14, 0.18),
  muted: rgb(0.38, 0.38, 0.44),
  rule: rgb(0.78, 0.78, 0.82),
} as const;

/* ── PDF builder ─────────────────────────────────────────────────── */

export async function markdownToPdf(markdown: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]); // US Letter
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 50;
  const marginBottom = 48;
  const pageWidth = page.getWidth() - marginX * 2;
  let cursorY = page.getHeight() - 50;

  /* ── draw a horizontal rule ─────────────────────────────────── */
  const drawRule = (gap = 6) => {
    ensureSpace(gap + 4);
    cursorY -= gap;
    page.drawLine({
      start: { x: marginX, y: cursorY },
      end: { x: marginX + pageWidth, y: cursorY },
      thickness: 0.5,
      color: COLORS.rule,
    });
    cursorY -= gap;
  };

  /* ── ensure enough vertical space (page break if not) ───────── */
  const ensureSpace = (needed: number) => {
    if (cursorY - needed < marginBottom) {
      page = pdfDoc.addPage([612, 792]);
      cursorY = page.getHeight() - 50;
    }
  };

  /* ── write a single line of text ────────────────────────────── */
  const writeLine = (
    text: string,
    opts?: { bold?: boolean; size?: number; indent?: number; gap?: number; color?: typeof COLORS.body },
  ) => {
    const size = opts?.size ?? 10;
    const indent = opts?.indent ?? 0;
    const gap = opts?.gap ?? 13.5;
    const color = opts?.color ?? COLORS.body;

    ensureSpace(gap + 2);

    const safeText = sanitizePdfText(text);
    if (!safeText.trim()) {
      cursorY -= gap * 0.5;
      return;
    }

    page.drawText(safeText, {
      x: marginX + indent,
      y: cursorY,
      size,
      font: opts?.bold ? boldFont : bodyFont,
      color,
    });

    cursorY -= gap;
  };

  /* ── Parse and render tables ────────────────────────────────── */
  const renderTable = (headerRow: string, dataRows: string[]) => {
    const parseRow = (row: string) =>
      row
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);

    const header = parseRow(headerRow);
    const rows = dataRows.map(parseRow);

    if (header.length < 2 || rows.length === 0) return;

    ensureSpace(16);

    // Render each data row as "Label: Value" pairs
    for (const row of rows) {
      for (let i = 0; i < header.length; i++) {
        const label = sanitizePdfText(header[i]);
        const value = sanitizePdfText(row[i] || "—");
        const line = `${label}: ${value}`;

        ensureSpace(11);
        page.drawText(line, {
          x: marginX + 8,
          y: cursorY,
          size: 9,
          font: bodyFont,
          color: COLORS.body,
        });
        cursorY -= 11;
      }
      // Add spacing between rows
      cursorY -= 3;
    }

    cursorY -= 4;
  };


  /* ── process the markdown line-by-line ──────────────────────── */
  const rawLines = markdown.replace(/\r/g, "").split("\n");

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();

    // Horizontal rules (---) -> draw a line
    if (/^-{3,}$/.test(trimmed)) {
      drawRule(5);
      continue;
    }

    // Skip empty lines
    if (!trimmed) {
      cursorY -= 5;
      continue;
    }

    // Detect table: header row followed by divider
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const nextLine = i + 1 < rawLines.length ? rawLines[i + 1].trim() : "";
      const isDivider = /^\|[\s:|-]+\|$/.test(nextLine);

      if (isDivider) {
        // Collect all data rows until next non-table line
        const dataRows: string[] = [];
        let j = i + 2;
        while (j < rawLines.length) {
          const potentialRow = rawLines[j].trim();
          if (potentialRow.startsWith("|") && potentialRow.endsWith("|")) {
            dataRows.push(potentialRow);
            j++;
          } else {
            break;
          }
        }

        renderTable(trimmed, dataRows);
        i = j - 1; // Skip parsed rows
        continue;
      }
    }

    const line = normalizeMarkdownLine(trimmed);

    // H1 - top-level heading
    if (line.startsWith("# ") && !line.startsWith("## ")) {
      const text = line.replace(/^#\s*/, "");
      ensureSpace(24);
      for (const part of wrapLine(text, 65)) {
        writeLine(part, { bold: true, size: 17, gap: 20, color: COLORS.heading });
      }
      continue;
    }

    // H2 - section heading
    if (line.startsWith("## ")) {
      ensureSpace(20);
      cursorY -= 4;
      const text = line.replace(/^##\s*/, "");
      for (const part of wrapLine(text, 72)) {
        writeLine(part, { bold: true, size: 13, gap: 16, color: COLORS.heading });
      }
      continue;
    }

    // H3
    if (line.startsWith("### ")) {
      ensureSpace(16);
      const text = line.replace(/^###\s*/, "");
      for (const part of wrapLine(text, 78)) {
        writeLine(part, { bold: true, size: 11.5, gap: 15, color: COLORS.heading });
      }
      continue;
    }

    // H4 - project names
    if (line.startsWith("#### ")) {
      ensureSpace(14);
      cursorY -= 2;
      const text = line.replace(/^####\s*/, "");
      for (const part of wrapLine(text, 82)) {
        writeLine(part, { bold: true, size: 10.5, gap: 14, color: COLORS.heading });
      }
      continue;
    }

    // Blockquotes - italic-style description
    if (line.startsWith("> ")) {
      const text = line.replace(/^>\s*/, "");
      for (const part of wrapLine(text, 88)) {
        writeLine(part, { size: 9.5, gap: 12.5, indent: 8, color: COLORS.muted });
      }
      continue;
    }

    // Bullet points
    if (line.startsWith("- ")) {
      const bulletText = line.replace(/^-\s*/, "");
      const wrapped = wrapLine(bulletText, 84);
      wrapped.forEach((part, idx) =>
        writeLine(`${idx === 0 ? "-" : " "} ${part}`, { indent: 6, gap: 13 }),
      );
      continue;
    }

    // Numbered items
    if (/^\d+\.\s/.test(line)) {
      const orderedText = line.replace(/^\d+\.\s/, "");
      const wrapped = wrapLine(orderedText, 84);
      wrapped.forEach((part, idx) =>
        writeLine(`${idx === 0 ? "-" : " "} ${part}`, { indent: 6, gap: 13 }),
      );
      continue;
    }

    // Default paragraph text
    for (const part of wrapLine(line, 92)) {
      writeLine(part, { size: 10, gap: 13 });
    }
  }

  return pdfDoc.save();
}