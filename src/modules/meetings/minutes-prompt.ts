/**
 * Prompt mẫu: đưa cho AI (Claude, ChatGPT...) kèm file Word biên bản để chuyển
 * sang markdown đúng cấu trúc app đọc được (xem parseMarkdown).
 */
export const MINUTES_PROMPT = `Chuyển biên bản họp giao ban (file đính kèm / nội dung bên dưới) sang Markdown theo ĐÚNG cấu trúc sau. Chỉ trả về markdown trong 1 khối code, không giải thích thêm.

\`\`\`markdown
---
title: Giao ban ngày DD/MM/YYYY
date: YYYY-MM-DD HH:mm
chair: <người chủ trì>
---

# <tiêu đề biên bản>

**Thành phần:** <thành phần tham dự>

## Nội dung

### I. <Mảng 1>

- <ý chính, số liệu, ý kiến chỉ đạo>

### II. <Mảng 2>

- ...

## Nhiệm vụ

| Hạng mục | Nội dung chỉ đạo | Đơn vị phụ trách | Thời hạn |
|---|---|---|---|
| <tên ngắn> | <việc cụ thể cần làm> | <phòng/người> | <thời hạn> |
\`\`\`

Quy tắc:
1. Frontmatter: "date" theo định dạng YYYY-MM-DD HH:mm (không rõ giờ thì 08:00; biên bản không ghi ngày thì để trống). "title" ngắn gọn dạng "Giao ban ngày DD/MM/YYYY".
2. "## Nội dung": tóm tắt theo từng mảng như biên bản, giữ nguyên số liệu, tên người, tên đơn vị, mốc thời gian. Không bịa thêm thông tin.
3. "## Nhiệm vụ": bảng đúng 4 cột như trên, mỗi dòng là 1 việc cụ thể cần giao.
   - Biên bản có sẵn bảng tổng hợp nhiệm vụ thì lấy từ đó, rồi bổ sung các việc được chỉ đạo rõ ràng trong phần nội dung mà bảng còn thiếu.
   - 1 ý chỉ đạo giao cho nhiều việc khác nhau thì tách thành nhiều dòng.
   - "Nội dung chỉ đạo" viết thành câu hành động, bắt đầu bằng động từ (Lập, Hoàn thiện, Làm việc với...).
   - "Thời hạn" ghi đúng như biên bản ("Tuần tới", "Sáng mai", "Tháng 12"...); không có thì để trống.
   - Trong ô KHÔNG dùng ký tự "|" và KHÔNG xuống dòng.
`;
