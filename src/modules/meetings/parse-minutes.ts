/**
 * Đọc biên bản họp giao ban → danh sách đầu mục.
 *
 * Ưu tiên "Bảng tổng hợp nhiệm vụ" (bảng có cột Hạng mục / Nội dung / Đơn vị /
 * Thời hạn). Không có bảng đó thì lấy các mục đánh số "1. ..." nằm dưới các
 * mảng "I. ...", nội dung là các đoạn văn ngay sau.
 */

export type ParsedItem = {
  section: string | null;
  title: string | null;
  content: string;
  department: string | null;
  deadline: string | null;
};

export type ParsedMinutes = {
  title: string | null;
  /** Ngày họp đọc từ dòng "Ngày họp: dd/mm/yyyy" (nếu có). */
  date: Date | null;
  /** Toàn văn biên bản (dạng chữ) — lưu vào mô tả cuộc họp để xem lại. */
  text: string;
  items: ParsedItem[];
};

type Block =
  | { kind: "p"; text: string }
  | { kind: "table"; rows: string[][] };

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function paragraphText(p: Element): string {
  let out = "";
  const walk = (n: Element) => {
    for (const c of Array.from(n.children)) {
      if (c.namespaceURI !== W_NS) continue;
      if (c.localName === "t") out += c.textContent ?? "";
      else if (c.localName === "tab") out += " ";
      else if (c.localName === "br") out += "\n";
      else walk(c);
    }
  };
  walk(p);
  return out.trim();
}

function readBlocks(xml: string): Block[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const body = doc.getElementsByTagNameNS(W_NS, "body")[0];
  if (!body) return [];
  const blocks: Block[] = [];
  for (const el of Array.from(body.children)) {
    if (el.localName === "p") {
      const text = paragraphText(el);
      if (text) blocks.push({ kind: "p", text });
    } else if (el.localName === "tbl") {
      const rows: string[][] = [];
      for (const tr of Array.from(el.children).filter((c) => c.localName === "tr")) {
        const cells = Array.from(tr.children)
          .filter((c) => c.localName === "tc")
          .map((tc) =>
            Array.from(tc.getElementsByTagNameNS(W_NS, "p"))
              .map(paragraphText)
              .filter(Boolean)
              .join("\n"),
          );
        if (cells.some(Boolean)) rows.push(cells);
      }
      if (rows.length) blocks.push({ kind: "table", rows });
    }
  }
  return blocks;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");

/** Xác định cột nào là gì từ dòng tiêu đề bảng. Trả null nếu không giống bảng nhiệm vụ. */
function detectColumns(header: string[]) {
  const h = header.map(norm);
  const find = (...keys: string[]) => h.findIndex((c) => keys.some((k) => c.includes(k)));
  const content = find("noi dung", "hanh dong", "chi dao", "cong viec can");
  if (content < 0) return null;
  const title = find("hang muc", "linh vuc", "dau muc");
  const department = find("don vi", "phu trach", "chu tri", "thuc hien");
  const deadline = find("thoi han", "han ", "tien do", "deadline");
  return {
    title: title === content ? -1 : title,
    content,
    department,
    deadline: deadline === content ? -1 : deadline,
  };
}

function rowsToItems(rows: string[][], section: string | null): ParsedItem[] {
  const cols = detectColumns(rows[0]);
  if (!cols) return [];
  const at = (r: string[], i: number) => (i >= 0 ? r[i]?.trim() || null : null);
  return rows
    .slice(1)
    .map((r) => ({
      section,
      title: at(r, cols.title),
      content: at(r, cols.content) ?? "",
      department: at(r, cols.department),
      deadline: at(r, cols.deadline),
    }))
    .filter((it) => it.content);
}

const ROMAN = /^(?:[IVX]+)\.\s+/;
const NUMBERED = /^\d+\.\s+/;

export function parseBlocks(blocks: Block[]): ParsedMinutes {
  const paragraphs = blocks.filter((b) => b.kind === "p").map((b) => b.text);
  const title = paragraphs.find((t) => /biên bản/i.test(t)) ?? paragraphs[0] ?? null;

  let date: Date | null = null;
  for (const t of paragraphs) {
    const m = /ngày\s*họp\s*:?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/i.exec(t);
    if (m) {
      date = new Date(+m[3], +m[2] - 1, +m[1], 8, 0);
      break;
    }
  }

  // Toàn văn: đoạn văn + bảng (ô cách nhau bởi " | ")
  const text = blocks
    .map((b) =>
      b.kind === "p"
        ? b.text
        : b.rows.map((r) => r.map((c) => c.replace(/\n/g, " ")).join(" | ")).join("\n"),
    )
    .join("\n");

  // 1) Bảng nhiệm vụ (lấy bảng cuối cùng khớp — thường là "Bảng tổng hợp")
  let fromTable: ParsedItem[] = [];
  for (const b of blocks) {
    if (b.kind === "table" && b.rows.length > 1) {
      const items = rowsToItems(b.rows, null);
      if (items.length) fromTable = items;
    }
  }
  if (fromTable.length) return { title, date, text, items: fromTable };

  // 2) Mục đánh số dưới các mảng La Mã
  const items: ParsedItem[] = [];
  let section: string | null = null;
  let cur: ParsedItem | null = null;
  for (const b of blocks) {
    if (b.kind !== "p") continue;
    if (ROMAN.test(b.text)) {
      section = b.text;
      cur = null;
    } else if (NUMBERED.test(b.text) && section) {
      cur = {
        section,
        title: b.text.replace(NUMBERED, ""),
        content: "",
        department: null,
        deadline: null,
      };
      items.push(cur);
    } else if (cur) {
      cur.content = cur.content ? `${cur.content}\n${b.text}` : b.text;
    }
  }
  return {
    title,
    date,
    text,
    items: items.map((it) => ({ ...it, content: it.content || it.title || "" })),
  };
}

// ---------------------------------------------------------------------------
// Markdown (xem public/mau-bien-ban-giao-ban.md)
// ---------------------------------------------------------------------------

/** "2026-10-21 08:00" | "2026-10-21" | "21/10/2026 14:30" | "21/10/2026" */
function parseLooseDate(s: string): Date | null {
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 8), +(m[5] ?? 0));
  m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2})[:h](\d{2}))?/.exec(s);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 8), +(m[5] ?? 0));
  return null;
}

function splitMdRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) =>
      c
        .replace(/\\\|/g, "|")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .trim(),
    );
}

const MD_SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export function parseMarkdown(raw: string): ParsedMinutes {
  // AI hay trả về trong khối ```markdown ... ``` → bỏ lớp bọc ngoài
  const src = raw
    .replace(/\r\n?/g, "\n")
    .replace(/^﻿/, "")
    .trim()
    .replace(/^```[\w-]*\n/, "")
    .replace(/\n```$/, "");

  // Frontmatter --- key: value ---
  const meta: Record<string, string> = {};
  let body = src;
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (fm) {
    body = src.slice(fm[0].length);
    for (const line of fm[1].split("\n")) {
      const m = /^\s*([\wÀ-ỹ ]+?)\s*:\s*(.*?)\s*$/.exec(line);
      if (m) meta[norm(m[1]).replace(/\s+/g, "_")] = m[2].replace(/^["']|["']$/g, "");
    }
  }

  const blocks: Block[] = [];
  let table: string[][] | null = null;
  let h1: string | null = null;
  for (const line of body.split("\n")) {
    if (line.trim().startsWith("|")) {
      if (MD_SEPARATOR.test(line.trim())) continue;
      if (!table) blocks.push({ kind: "table", rows: (table = []) });
      table.push(splitMdRow(line));
      continue;
    }
    table = null;
    const h = /^#\s+(.+)/.exec(line);
    if (h && !h1) h1 = h[1].trim();
    const text = line
      .replace(/^#+\s*/, "")
      .replace(/^\s*[-*+]\s+/, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .trim();
    if (text) blocks.push({ kind: "p", text });
  }

  const parsed = parseBlocks(blocks);
  const chair = meta.chair ?? meta.chu_tri ?? meta.nguoi_chu_tri;
  return {
    ...parsed,
    title: meta.title ?? meta.tieu_de ?? meta.ten ?? h1 ?? parsed.title,
    date: parseLooseDate(meta.date ?? meta.ngay ?? meta.ngay_hop ?? "") ?? parsed.date,
    text: [chair && `Người chủ trì: ${chair}`, body.trim()].filter(Boolean).join("\n\n"),
  };
}

/** Chữ dán vào có phải markdown biên bản (frontmatter hoặc bảng markdown)? */
export function looksLikeMarkdown(raw: string): boolean {
  return /^\s*---\n/.test(raw.replace(/\r\n?/g, "\n")) || /^\s*\|.*\|\s*$\n^\s*\|?\s*:?-{3,}/m.test(raw.replace(/\r\n?/g, "\n"));
}

export async function parseMinutesFile(file: File): Promise<ParsedMinutes> {
  if (/\.(md|markdown|txt)$/i.test(file.name)) return parseMarkdown(await file.text());
  return parseDocx(file);
}

export async function parseDocx(file: File): Promise<ParsedMinutes> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("File không phải biên bản Word (.docx) hợp lệ");
  return parseBlocks(readBlocks(xml));
}

/**
 * Đọc chữ dán vào: copy bảng từ Word/Excel ra sẽ có ô cách nhau bằng Tab.
 * Có dòng tiêu đề (Hạng mục / Nội dung...) thì tự nhận cột; không thì mỗi dòng
 * là 1 đầu mục (bỏ gạch đầu dòng).
 */
export function parsePastedText(raw: string): ParsedItem[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const rows = lines.map((l) => l.split("\t").map((c) => c.trim()));
  if (rows[0].length > 1) {
    const withHeader = rowsToItems(rows, null);
    if (withHeader.length) return withHeader;
    // Không có tiêu đề: mặc định thứ tự cột như bảng tổng hợp biên bản
    if (rows.every((r) => r.length >= 2)) {
      return rows.map((r) => ({
        section: null,
        title: r[0] || null,
        content: r[1],
        department: r[2] || null,
        deadline: r[3] || null,
      })).filter((it) => it.content);
    }
  }
  return lines.map((l) => ({
    section: null,
    title: null,
    content: l.replace(/^\s*(?:[-–—•*+]|\d+[.)])\s*/, "").trim(),
    department: null,
    deadline: null,
  })).filter((it) => it.content);
}
