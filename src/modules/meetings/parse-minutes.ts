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
  if (fromTable.length) return { title, text, items: fromTable };

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
    text,
    items: items.map((it) => ({ ...it, content: it.content || it.title || "" })),
  };
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
