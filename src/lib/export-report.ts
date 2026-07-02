import { format } from "date-fns";
import { periodRange, type Period } from "@/lib/period";
import { TASK_STATUS_META, DEPARTMENTS } from "@/modules/tasks/constants";
import type { Task, TaskLog } from "@/types/database";

const MAROON = "FF7A1F2B"; // màu thương hiệu cho tiêu đề
const GROUP_FILL = "FFF3E8EA"; // nền nhóm phòng
const BORDER = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const ALL_BORDERS = {
  top: BORDER,
  left: BORDER,
  bottom: BORDER,
  right: BORDER,
};

/** Giá trị "Cập nhật mới nhất" của task tính đến trước mốc `beforeMs`. */
function snapshotBefore(logs: TaskLog[], taskId: string): string {
  // logs đã lọc created_at < đầu tuần & sắp tăng dần → phần tử cuối là mới nhất.
  let value = "";
  for (const l of logs) {
    if (l.task_id === taskId && typeof l.new_value === "string")
      value = l.new_value;
  }
  return value;
}

/** Xuất báo cáo công việc theo kỳ ra file Excel (.xlsx). */
export async function exportWeeklyReport(opts: {
  tasks: Task[];
  logs: TaskLog[];
  nameOf: (id: string | null) => string | null;
  period: Period;
}): Promise<void> {
  const { tasks, logs, nameOf, period } = opts;
  const ExcelJS = (await import("exceljs")).default;

  const { start } = periodRange(period);
  const isWeek = period.mode === "week" && !!start;
  const startLabel = start ? format(start, "dd/MM") : "";
  const nowLabel = format(new Date(), "dd/MM/yyyy");

  // Cấu hình cột
  const cols: { key: string; header: string; width: number }[] = [
    { key: "stt", header: "STT", width: 6 },
    { key: "title", header: "Hạng mục / Công việc", width: 42 },
    { key: "assignee", header: "Người phụ trách", width: 20 },
    { key: "status", header: "Trạng thái", width: 18 },
  ];
  if (isWeek)
    cols.push({ key: "prev", header: `Tiến độ đến ${startLabel}`, width: 38 });
  cols.push({
    key: "current",
    header: `Tiến độ hiện tại (${nowLabel})`,
    width: 40,
  });
  cols.push({ key: "note", header: "Ghi chú", width: 26 });

  const ncols = cols.length;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Báo cáo tuần", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));

  // ---- Tiêu đề ----
  ws.mergeCells(1, 1, 1, ncols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = "BÁO CÁO TIẾN ĐỘ CÔNG VIỆC";
  titleCell.font = { bold: true, size: 15, color: { argb: MAROON } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, ncols);
  const subCell = ws.getCell(2, 1);
  subCell.value =
    period.mode === "all"
      ? "Tất cả công việc"
      : `Kỳ: ${format(start ?? new Date(), "dd/MM/yyyy")} — xuất ${nowLabel}`;
  subCell.font = { italic: true, color: { argb: "FF666666" } };
  subCell.alignment = { horizontal: "center" };

  // ---- Header ----
  const headerRow = ws.getRow(3);
  cols.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MAROON } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    cell.border = ALL_BORDERS;
  });
  headerRow.height = 30;

  // ---- Nhóm theo phòng ----
  const deptOrder = [...DEPARTMENTS.map((d) => d.value), "__none__"];
  let stt = 0;

  const addTaskRow = (t: Task) => {
    stt += 1;
    const statusLabel = TASK_STATUS_META[t.status].label;
    const rowValues: Record<string, string | number> = {
      stt,
      title: t.title,
      assignee: nameOf(t.assignee_id) ?? "Chưa giao",
      status: `${statusLabel} (${t.manual_progress}%)`,
      current: t.latest_update ?? "",
      note: t.note ?? "",
    };
    if (isWeek) rowValues.prev = snapshotBefore(logs, t.id);

    const row = ws.addRow(rowValues);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = ALL_BORDERS;
    });
    row.getCell("stt").alignment = { horizontal: "center", vertical: "top" };
  };

  for (const dept of deptOrder) {
    const list = tasks.filter((t) =>
      dept === "__none__" ? !t.department : t.department === dept,
    );
    if (list.length === 0) continue;

    // Dòng nhóm phòng
    const groupRowIdx = ws.rowCount + 1;
    ws.mergeCells(groupRowIdx, 1, groupRowIdx, ncols);
    const gCell = ws.getCell(groupRowIdx, 1);
    gCell.value = dept === "__none__" ? "Chưa phân phòng" : dept;
    gCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GROUP_FILL },
    };
    gCell.font = { bold: true, color: { argb: MAROON } };
    gCell.border = ALL_BORDERS;
    ws.getRow(groupRowIdx).height = 20;

    list.forEach(addTaskRow);
  }

  // ---- Tải xuống ----
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Bao-cao-cong-viec_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
