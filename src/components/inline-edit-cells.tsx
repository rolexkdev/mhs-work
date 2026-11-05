"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const INPUT_CLASS =
  "w-full rounded border border-input bg-background px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Title cell: click opens the detail view, double-click renames in place.
 * When `disabled`, the title still opens the detail view but cannot be renamed.
 */
export function EditableTitle({
  value,
  isDone = false,
  onOpen,
  onRename,
  disabled = false,
}: {
  value: string;
  isDone?: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const v = draft.trim();
    if (v && v !== value) onRename(v);
    else setDraft(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={cn(INPUT_CLASS, "text-sm font-medium")}
      />
    );
  }

  return (
    <button
      onClick={onOpen}
      onDoubleClick={
        disabled
          ? undefined
          : () => {
              setDraft(value);
              setEditing(true);
            }
      }
      title={
        disabled
          ? "Bấm để mở chi tiết"
          : "Bấm để mở chi tiết · bấm đúp để đổi tên"
      }
      className={cn(
        "block min-w-0 max-w-full truncate text-left text-sm font-medium hover:underline",
        isDone && "text-muted-foreground line-through",
      )}
    >
      {value}
    </button>
  );
}

/** Date cell: shows a label, click to pick a date via a native date input. */
export function InlineDateCell({
  value,
  label,
  className,
  onChange,
  disabled = false,
}: {
  value: string | null;
  label: string;
  className?: string;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (disabled) {
    return (
      <span className={cn("truncate px-1 py-0.5 text-xs", className)}>
        {label}
      </span>
    );
  }

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        // Local calendar date: a timestamp stored as local midnight (UTC+7)
        // would otherwise show the previous day with a plain slice(0, 10).
        defaultValue={value ? new Date(value).toLocaleDateString("sv-SE") : ""}
        onBlur={() => setEditing(false)}
        onChange={(e) =>
          onChange(e.target.value ? new Date(e.target.value).toISOString() : null)
        }
        className={cn(INPUT_CLASS, "px-1 text-xs")}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Bấm để đổi ngày"
      className={cn(
        "truncate rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60",
        className,
      )}
    >
      {label}
    </button>
  );
}

/** Free-text cell with optional `<datalist>` suggestions. Empty → `null`. */
export function InlineTextCell({
  value,
  placeholder = "+ Trống",
  onChange,
  listId,
  disabled = false,
}: {
  value: string | null;
  placeholder?: string;
  onChange: (value: string | null) => void;
  listId?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  if (disabled) {
    return (
      <span className="block truncate px-1 py-0.5 text-xs">
        {value || <span className="text-muted-foreground">—</span>}
      </span>
    );
  }

  function commit() {
    const v = draft.trim() || null;
    if (v !== (value ?? null)) onChange(v);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        className={cn(INPUT_CLASS, "text-xs")}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
      title="Bấm để sửa"
      className="block max-w-full truncate rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60"
    >
      {value || <span className="text-muted-foreground/60">{placeholder}</span>}
    </button>
  );
}

/** Integer cell; invalid values or values below `min` are reverted. */
export function InlineNumberCell({
  value,
  min = 1,
  onChange,
  disabled = false,
  className,
}: {
  value: number;
  min?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (disabled) {
    return (
      <span className={cn("px-1 py-0.5 text-xs tabular-nums", className)}>
        {value}
      </span>
    );
  }

  function commit() {
    const n = Math.floor(Number(draft));
    if (Number.isFinite(n) && n >= min && n !== value) onChange(n);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={min}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
        className={cn(INPUT_CLASS, "text-xs tabular-nums", className)}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      title="Bấm để sửa"
      className={cn(
        "rounded px-1 py-0.5 text-xs tabular-nums hover:bg-muted/60",
        className,
      )}
    >
      {value}
    </button>
  );
}
