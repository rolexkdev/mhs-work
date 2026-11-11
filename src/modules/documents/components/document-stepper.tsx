import { Check, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortDateTime } from "@/lib/format";
import type { DocumentStep } from "@/types/database";

type NodeState = "done" | "current" | "returned" | "upcoming";

const NODE_CIRCLE: Record<NodeState, string> = {
  // Same palette as the status pills: emerald = done, blue = in progress,
  // orange = returned, muted = not reached.
  done: "border-emerald-200 bg-emerald-100 text-emerald-700",
  current: "border-blue-500 bg-blue-500 text-white",
  returned: "border-orange-500 bg-orange-500 text-white",
  upcoming: "border-border bg-muted text-muted-foreground",
};

const NODE_LINE: Record<NodeState, string> = {
  done: "bg-emerald-400",
  current: "bg-blue-400",
  returned: "bg-orange-400",
  upcoming: "bg-border",
};

/**
 * Lộ trình hồ sơ dạng ngang: mỗi bước một điểm (xong / đang giữ / chưa tới),
 * nối bằng đường kẻ, kết thúc bằng điểm "Xong".
 *
 * Ngày hiển thị "dd/MM HH:mm" theo spec; màu chỉ lấy từ token theme và bảng
 * màu trạng thái sẵn có (không dùng màu của bản HTML mẫu).
 */
export function DocumentStepper({
  steps,
  finishedAt,
}: {
  steps: DocumentStep[];
  finishedAt: string | null;
}) {
  const sorted = [...steps].sort((a, b) => a.step_order - b.step_order);

  if (sorted.length === 0) {
    return (
      <span className="text-xs text-muted-foreground/60">Chưa có lộ trình</span>
    );
  }

  // Only a step that has been received is the current one: a draft with a
  // planned route shows every step as upcoming.
  const currentIndex = sorted.findIndex(
    (step) => !step.done_at && !!step.received_at,
  );
  // Since 0019 a done route is not the end: the document still goes back to
  // the sender, so only finished_at marks the final node done.
  const finished = !!finishedAt;

  return (
    <div className="max-w-full overflow-x-auto">
      <ol className="flex w-max items-start">
        {sorted.map((step, index) => {
          const done = !!step.done_at;
          const isCurrent = index === currentIndex;
          const returned = isCurrent && !!step.returned_at;
          const state: NodeState = done
            ? "done"
            : isCurrent
              ? returned
                ? "returned"
                : "current"
              : "upcoming";

          return (
            <li key={step.id} className="flex items-start">
              {index > 0 && (
                <span
                  className={cn(
                    "mt-[9px] h-px w-4 shrink-0",
                    NODE_LINE[state],
                  )}
                />
              )}

              <div
                className="flex w-[76px] flex-col items-center gap-1 px-0.5"
                title={`${step.department}${
                  step.done_at
                    ? ` — xong ${formatShortDateTime(step.done_at)}`
                    : step.returned_at
                      ? ` — trả lại ${formatShortDateTime(step.returned_at)}`
                      : step.received_at
                        ? ` — nhận ${formatShortDateTime(step.received_at)}`
                        : ""
                }${step.handler_name ? ` — ${step.handler_name}` : ""}`}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                    NODE_CIRCLE[state],
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : index + 1}
                </span>

                <span
                  className={cn(
                    "w-full truncate text-center text-[11px] font-medium",
                    done ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {step.department}
                </span>

                {done ? (
                  <span className="whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                    xong {formatShortDateTime(step.done_at)}
                  </span>
                ) : isCurrent ? (
                  <span className="text-center text-[10px] leading-tight text-muted-foreground">
                    nhận {formatShortDateTime(step.received_at)}
                    {returned && (
                      <>
                        <br />
                        trả lại {formatShortDateTime(step.returned_at)}
                      </>
                    )}
                  </span>
                ) : (
                  <span className="whitespace-nowrap text-[10px] leading-tight text-muted-foreground/70">
                    chưa tới
                  </span>
                )}
              </div>

              {index === sorted.length - 1 && (
                <span
                  className={cn(
                    "mt-[9px] h-px w-4 shrink-0",
                    finished ? NODE_LINE.done : NODE_LINE.upcoming,
                  )}
                />
              )}
            </li>
          );
        })}

        {/* Điểm cuối: hồ sơ đã xong */}
        <li className="flex items-start">
          <div
            className="flex w-[56px] flex-col items-center gap-1 px-0.5"
            title={
              finishedAt
                ? `Hoàn thành ${formatShortDateTime(finishedAt)}`
                : "Chưa hoàn thành"
            }
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                finished
                  ? NODE_CIRCLE.done
                  : "border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground",
              )}
            >
              {finished ? (
                <Check className="h-3 w-3" />
              ) : (
                <Flag className="h-3 w-3" />
              )}
            </span>
            <span className="text-[11px] font-medium">Xong</span>
            {finishedAt && (
              <span className="whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                {formatShortDateTime(finishedAt)}
              </span>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}
