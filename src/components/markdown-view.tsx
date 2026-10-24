import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Hiển thị markdown đơn giản (biên bản họp) cho người không rành ký tự markdown:
 * tiêu đề #, danh sách - / 1., **đậm**, *nghiêng*, `code`, bảng |...|, ---.
 * Cũng đọc được toàn văn lấy từ file Word (bảng dạng "a | b | c", mục "I. ...").
 *
 * Render thẳng ra phần tử React (không dùng innerHTML) → không lo chèn mã.
 */
export function MarkdownView({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed", className)}>
      {parse(source)}
    </div>
  );
}

// ---------------------------------------------------------------------------

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; lines: string[] }
  | { kind: "ul" | "ol"; items: string[]; start?: number }
  | { kind: "table"; rows: string[][] }
  | { kind: "hr" };

const MD_SEP = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const ROMAN_HEADING = /^[IVX]+\.\s+\S/;

function splitRow(line: string): string[] {
  const t = line.trim();
  const inner = t.startsWith("|") ? t.replace(/^\|/, "").replace(/\|$/, "") : t;
  return inner
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, "|").trim());
}

/** Dòng bảng: markdown "| a | b |" hoặc toàn văn Word "a | b | c". */
function isRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") || / \| /.test(t);
}

function toBlocks(src: string): Block[] {
  const lines = src
    .replace(/\r\n?/g, "\n")
    .replace(/^---\n[\s\S]*?\n---\n?/, "") // bỏ frontmatter
    .split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) {
      i++;
      continue;
    }

    // Đường kẻ ngang
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // Tiêu đề markdown
    const h = /^(#{1,6})\s+(.+)$/.exec(t);
    if (h) {
      blocks.push({ kind: "h", level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    // Mục La Mã kiểu biên bản Word: "I. MẢNG XỬ LÝ NƯỚC THẢI"
    if (ROMAN_HEADING.test(t) && t.length < 120) {
      blocks.push({ kind: "h", level: 3, text: t });
      i++;
      continue;
    }

    // Bảng: >= 2 dòng liên tiếp có "|"
    if (isRow(t) && i + 1 < lines.length && isRow(lines[i + 1].trim())) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && isRow(lines[i].trim())) {
        if (!MD_SEP.test(lines[i].trim())) rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ kind: "table", rows });
      continue;
    }

    // Danh sách
    const ul = /^\s*[-*+•]\s+(.*)$/;
    const ol = /^\s*\d+[.)]\s+(.*)$/;
    if (ul.test(line) || ol.test(line)) {
      const kind = ul.test(line) ? "ul" : "ol";
      const re = kind === "ul" ? ul : ol;
      // Giữ số thứ tự gốc ("2. ..." đứng riêng vẫn là 2, không bị đánh lại 1)
      const start = kind === "ol" ? parseInt(line.trim(), 10) : undefined;
      const items: string[] = [];
      while (i < lines.length && re.test(lines[i])) {
        items.push(re.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ kind, items, start });
      continue;
    }

    // Đoạn văn: gom các dòng liền nhau
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|[-*+•]\s|\d+[.)]\s|(-{3,}|\*{3,})$)/.test(lines[i].trim()) &&
      !(isRow(lines[i]) && i + 1 < lines.length && isRow(lines[i + 1]))
    ) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) blocks.push({ kind: "p", lines: para });
    else i++;
  }
  return blocks;
}

/** **đậm**, *nghiêng* / _nghiêng_, `code`; đoạn "Nhãn: nội dung" in đậm phần nhãn. */
function inline(text: string, labelBold = false): ReactNode {
  const out: ReactNode[] = [];
  let rest = text;

  // "Phương án xử lý: ..." → nhãn đậm (chỉ khi chưa có ** và nhãn ngắn)
  if (labelBold && !rest.includes("**")) {
    const m = /^([^:*`|]{2,60}?[^\d\s]):\s+(.+)$/.exec(rest);
    if (m) {
      out.push(<strong key="lb" className="font-semibold text-foreground">{m[1]}:</strong>, " ");
      rest = m[2];
    }
  }

  const re = /(\*\*(.+?)\*\*|`([^`]+)`|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])|(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w))/g;
  let last = 0;
  let k = 0;
  for (const m of rest.matchAll(re)) {
    if (m.index! > last) out.push(rest.slice(last, m.index));
    if (m[2] !== undefined)
      out.push(<strong key={k++} className="font-semibold text-foreground">{m[2]}</strong>);
    else if (m[3] !== undefined)
      out.push(<code key={k++} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{m[3]}</code>);
    else out.push(<em key={k++}>{m[4] ?? m[5]}</em>);
    last = m.index! + m[0].length;
  }
  if (last < rest.length) out.push(rest.slice(last));
  return out.map((n, idx) => <Fragment key={`i${idx}`}>{n}</Fragment>);
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-lg font-semibold",
  2: "mt-2 border-b pb-1 text-base font-semibold",
  3: "mt-1 text-sm font-semibold uppercase tracking-wide text-primary",
};

function parse(src: string): ReactNode {
  return toBlocks(src).map((b, idx) => {
    switch (b.kind) {
      case "h":
        return (
          <p key={idx} className={HEADING_CLASS[b.level] ?? "font-semibold"}>
            {inline(b.text)}
          </p>
        );
      case "p":
        return (
          <p key={idx} className="text-foreground/90">
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l, true)}
              </Fragment>
            ))}
          </p>
        );
      case "ul":
      case "ol": {
        const Tag = b.kind;
        return (
          <Tag
            key={idx}
            start={b.kind === "ol" ? b.start : undefined}
            className={cn(
              "space-y-1 pl-5 text-foreground/90 marker:text-muted-foreground",
              b.kind === "ul" ? "list-disc" : "list-decimal",
            )}
          >
            {b.items.map((it, j) => (
              <li key={j}>{inline(it, true)}</li>
            ))}
          </Tag>
        );
      }
      case "table": {
        const [head, ...body] = b.rows;
        return (
          <div key={idx} className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/60">
                <tr>
                  {head.map((c, j) => (
                    <th key={j} className="whitespace-nowrap px-3 py-2 font-semibold">
                      {inline(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {body.map((r, j) => (
                  <tr key={j} className="align-top">
                    {head.map((_, c) => (
                      <td key={c} className="px-3 py-2">
                        {inline(r[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case "hr":
        return <hr key={idx} className="border-border" />;
    }
  });
}
