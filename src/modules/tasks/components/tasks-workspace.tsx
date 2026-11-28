"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  LayoutGrid,
  List,
  Plus,
  Link2,
  Filter,
  Layers,
  FileSpreadsheet,
  Loader2,
  ArrowLeft,
  FolderTree,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { DATE_RANGE_ERROR, isDateRangeValid } from "@/modules/tasks/dates";
import { LinkTasksDialog } from "@/modules/meetings/link-tasks-dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { exportWeeklyReport } from "@/lib/export-report";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useProfiles } from "@/modules/auth/use-profiles";
import { useMeetings } from "@/modules/meetings/hooks";
import {
  useTasks,
  useUpdateTask,
  useDeleteTask,
  NO_DEPARTMENT,
  type TaskQueryFilters,
} from "@/modules/tasks/hooks";
import {
  TASK_DEPARTMENTS,
  TASK_STATUS_META,
  TASK_STATUS_ORDER,
  TASK_PRIORITY_META,
  TASK_PRIORITY_ORDER,
} from "@/modules/tasks/constants";
import { TaskBoard } from "@/modules/tasks/components/task-board";
import {
  TaskListView,
  type GroupBy,
} from "@/modules/tasks/components/task-list-view";
import { TaskFormDialog } from "@/modules/tasks/components/task-form-dialog";
import { TaskDetailPanel } from "@/modules/tasks/components/task-detail-panel";
import {
  CategoryOverview,
  tasksOfCategoryKey,
  uncategorizedDepartment,
  type StatKey,
} from "@/modules/tasks/components/category-overview";
import { CategoryManagerDialog } from "@/modules/tasks/components/category-manager-dialog";
import { useTaskCategories } from "@/modules/tasks/category-hooks";
import { useCanManageCategories } from "@/modules/auth/use-current-role";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PeriodPicker } from "@/components/period-picker";
import {
  type Period,
  currentPeriod,
  isTaskInPeriod,
  periodRange,
  weekKey,
} from "@/lib/period";
import type { Task, TaskStatus, TaskLog } from "@/types/database";

const ALL = "__all__";

const DEPARTMENT_OPTIONS = [
  ...TASK_DEPARTMENTS.map((d) => ({ value: d.value, label: d.value })),
  { value: NO_DEPARTMENT, label: "Chưa phân phòng" },
];

const VALID_DEPARTMENTS = new Set(DEPARTMENT_OPTIONS.map((o) => o.value));
const VALID_STATUSES = new Set<string>(TASK_STATUS_ORDER);
const VALID_PRIORITIES = new Set<string>(TASK_PRIORITY_ORDER);

function readParam(
  params: Pick<URLSearchParams, "get">,
  key: string,
  valid?: Set<string>,
): string {
  const value = params.get(key);
  if (!value) return ALL;
  if (valid && !valid.has(value)) return ALL;
  return value;
}

/** Set or clear URL query params while preserving all other params on the page. */
function updateUrlParams(
  patch: Record<string, string | null>,
  /** "push" adds a history entry so the browser Back button returns. */
  mode: "replace" | "push" = "replace",
) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  const url = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/** `category` URL value that lists every task instead of the overview. */
const ALL_TASKS = "all";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "Bảng mặc định" },
  { value: "department", label: "Phòng/Nhóm" },
  { value: "category", label: "Hạng mục" },
  { value: "assignee", label: "Người phụ trách" },
  { value: "status", label: "Trạng thái" },
  { value: "meeting", label: "Cuộc họp" },
];

export function TasksWorkspace({ meetingId }: { meetingId?: string }) {
  const searchParams = useSearchParams();
  const [view, setView] = useState<"board" | "list">("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("department");
  // Trong trang chi tiết cuộc họp: xem tất cả task của họp, không lọc theo tuần.
  const [period, setPeriod] = useState<Period>(() =>
    meetingId ? { mode: "all", anchor: new Date().toISOString() } : currentPeriod(),
  );
  const [departmentFilter, setDepartmentFilter] = useState<string>(() =>
    readParam(searchParams, "department", VALID_DEPARTMENTS),
  );
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    readParam(searchParams, "status", VALID_STATUSES),
  );
  const [priorityFilter, setPriorityFilter] = useState<string>(() =>
    readParam(searchParams, "priority", VALID_PRIORITIES),
  );
  const [assigneeFilter, setAssigneeFilter] = useState<string>(() =>
    readParam(searchParams, "assignee"),
  );
  // Outside a meeting the page opens on the category overview (null); a
  // category id, an uncategorized key ("none:<dept>") or ALL_TASKS lists tasks.
  const [categoryKey, setCategoryKey] = useState<string | null>(() =>
    meetingId ? ALL_TASKS : searchParams.get("category"),
  );
  const [manageDepartment, setManageDepartment] = useState<
    string | null | undefined
  >(undefined);

  const [createOpen, setCreateOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [openStat, setOpenStat] = useState<StatKey | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [exporting, setExporting] = useState(false);
  // Trên điện thoại các bộ lọc nằm trong một tấm kéo từ đáy, không bày ra hàng ngang.
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Sync filters and open task detail when URL query params change.
  useEffect(() => {
    const dept = readParam(searchParams, "department", VALID_DEPARTMENTS);
    const status = readParam(searchParams, "status", VALID_STATUSES);
    const priority = readParam(searchParams, "priority", VALID_PRIORITIES);
    const assignee = readParam(searchParams, "assignee");
    setDepartmentFilter(dept);
    setStatusFilter(status);
    setPriorityFilter(priority);
    setAssigneeFilter(assignee);
    if (!meetingId) setCategoryKey(searchParams.get("category"));

    const invalidPatch: Record<string, null> = {};
    if (searchParams.get("department") && dept === ALL)
      invalidPatch.department = null;
    if (searchParams.get("status") && status === ALL)
      invalidPatch.status = null;
    if (searchParams.get("priority") && priority === ALL)
      invalidPatch.priority = null;
    if (Object.keys(invalidPatch).length > 0) updateUrlParams(invalidPatch);

    const tid = searchParams.get("task");
    if (tid) {
      setDetailId(tid);
      setDetailOpen(true);
    }
  }, [searchParams, meetingId]);

  function openCategory(key: string | null) {
    setCategoryKey(key);
    updateUrlParams({ category: key }, "push");
  }

  function handleDepartmentFilterChange(v: string) {
    setDepartmentFilter(v);
    updateUrlParams({ department: v });
  }
  function handleStatusFilterChange(v: string) {
    setStatusFilter(v);
    updateUrlParams({ status: v });
  }
  function handlePriorityFilterChange(v: string) {
    setPriorityFilter(v);
    updateUrlParams({ priority: v });
  }
  function handleAssigneeFilterChange(v: string) {
    setAssigneeFilter(v);
    updateUrlParams({ assignee: v });
  }
  function handleClearFilters() {
    setDepartmentFilter(ALL);
    setStatusFilter(ALL);
    setPriorityFilter(ALL);
    setAssigneeFilter(ALL);
    updateUrlParams({
      department: null,
      status: null,
      priority: null,
      assignee: null,
    });
  }

  const { data: profiles = [] } = useProfiles();
  const { data: meetings = [] } = useMeetings();
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useTaskCategories();
  const canManageCategories = useCanManageCategories();

  const filters: TaskQueryFilters = {
    meetingId: meetingId ?? null,
    department: departmentFilter === ALL ? null : departmentFilter,
    status: statusFilter === ALL ? null : (statusFilter as Task["status"]),
    priority:
      priorityFilter === ALL ? null : (priorityFilter as Task["priority"]),
    assigneeId: assigneeFilter === ALL ? null : assigneeFilter,
  };
  const { data: tasks = [], isLoading } = useTasks(filters);

  // Lọc theo kỳ (tuần/tháng) — bỏ qua khi đang ở trong 1 cuộc họp.
  const visibleTasks = useMemo(
    () => tasks.filter((t) => isTaskInPeriod(t, period)),
    [tasks, period],
  );

  // A category id that no longer exists (deleted) falls back to the overview.
  const activeCategory =
    categoryKey && categoryKey !== ALL_TASKS
      ? categories.find((c) => c.id === categoryKey) ?? null
      : null;
  const uncategorizedDept =
    categoryKey && categoryKey !== ALL_TASKS
      ? uncategorizedDepartment(categoryKey)
      : undefined;
  const scope: "overview" | "all" | "category" = !categoryKey
    ? "overview"
    : categoryKey === ALL_TASKS
      ? "all"
      : activeCategory || uncategorizedDept !== undefined
        ? "category"
        : categoriesLoading
          ? "category"
          : "overview";
  const scopedTasks = useMemo(
    () =>
      scope === "category" && categoryKey
        ? tasksOfCategoryKey(visibleTasks, categoryKey, categories)
        : visibleTasks,
    [scope, categoryKey, visibleTasks, categories],
  );
  const scopeDepartment = activeCategory
    ? activeCategory.department
    : uncategorizedDept;

  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p) => m.set(p.id, p.full_name ?? p.email));
    return m;
  }, [profiles]);
  const nameOf = (id: string | null) => (id ? nameById.get(id) ?? null : null);

  const avatarById = useMemo(() => {
    const m = new Map<string, string | null>();
    profiles.forEach((p) => m.set(p.id, p.avatar_url));
    return m;
  }, [profiles]);
  const avatarOf = (id: string | null) =>
    id ? avatarById.get(id) ?? null : null;

  function openDetail(t: Task) {
    setDetailId(t.id);
    setDetailOpen(true);
    // Đưa ?task=<id> lên thanh địa chỉ để có thể copy link chia sẻ.
    updateUrlParams({ task: t.id });
  }
  function handleDetailOpenChange(v: boolean) {
    setDetailOpen(v);
    if (!v) updateUrlParams({ task: null });
  }
  function handleStatusChange(id: string, status: TaskStatus) {
    updateTask.mutate({ id, status });
  }
  function handlePatch(id: string, patch: Partial<Task>) {
    if ("start_date" in patch || "due_date" in patch) {
      const current = tasks.find((t) => t.id === id);
      const start =
        "start_date" in patch ? patch.start_date : current?.start_date;
      const due = "due_date" in patch ? patch.due_date : current?.due_date;
      if (!isDateRangeValid(start, due)) {
        toast.error(DATE_RANGE_ERROR);
        return;
      }
    }
    // Categories belong to a department: moving the task drops its category.
    if ("department" in patch && !("category_id" in patch)) {
      const current = tasks.find((t) => t.id === id);
      if (current && current.department !== patch.department)
        patch = { ...patch, category_id: null };
    }
    updateTask.mutate({ id, ...patch });
  }
  function handleDelete(t: Task) {
    setPendingDelete(t);
  }
  async function handleExport() {
    if (scopedTasks.length === 0) {
      toast.info("Không có công việc nào trong kỳ để xuất.");
      return;
    }
    setExporting(true);
    try {
      // Lấy log "cập nhật mới nhất" TRƯỚC đầu tuần → cột "Tiến độ đến đầu tuần".
      let logs: TaskLog[] = [];
      const { start } = periodRange(period);
      if (period.mode === "week" && start) {
        const supabase = createClient();
        const ids = scopedTasks.map((t) => t.id);
        const { data } = await supabase
          .from("task_logs")
          .select("*")
          .eq("action", "latest_update")
          .in("task_id", ids)
          .lt("created_at", start.toISOString())
          .order("created_at", { ascending: true });
        logs = data ?? [];
      }
      await exportWeeklyReport({ tasks: scopedTasks, logs, nameOf, period });
      toast.success("Đã xuất báo cáo Excel");
    } catch (e) {
      toast.error("Xuất báo cáo thất bại");
      console.error(e);
    } finally {
      setExporting(false);
    }
  }
  function handleToggleWeekHidden(t: Task) {
    const { start } = periodRange(period);
    if (!start) return;
    const wk = weekKey(start);
    const has = t.hidden_weeks?.includes(wk);
    const hidden_weeks = has
      ? t.hidden_weeks.filter((w) => w !== wk)
      : [...(t.hidden_weeks ?? []), wk];
    updateTask.mutate({ id: t.id, hidden_weeks });
  }

  const activeFilterCount = [
    departmentFilter,
    statusFilter,
    priorityFilter,
    assigneeFilter,
  ].filter((v) => v !== ALL).length;

  const statSheetOpen =
    scope === "overview" && !categoriesError && openStat !== null;

  const detailPanel = (
    <TaskDetailPanel
      taskId={detailId}
      open={detailOpen}
      onOpenChange={handleDetailOpenChange}
      meetings={meetings}
    />
  );

  return (
    <div className="space-y-4">
      {/* ── Thanh công cụ trên điện thoại ── */}
      <div className="space-y-2 md:hidden">
        {!meetingId && <PeriodPicker value={period} onChange={setPeriod} />}

        <div className="flex items-center gap-2">
          {scope !== "overview" && (
            <Tabs
              value={view}
              onValueChange={(v) => setView(v as typeof view)}
              className="shrink-0"
            >
              <TabsList className="h-9">
                <TabsTrigger value="list" className="px-2.5">
                  <List className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="board" className="px-2.5">
                  <LayoutGrid className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <Button
            variant="outline"
            className="h-9 flex-1 justify-start px-3"
            onClick={() => setFilterSheetOpen(true)}
          >
            <Filter className="h-4 w-4" />
            <span className="truncate">Lọc & nhóm</span>
            {activeFilterCount > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {!meetingId && (
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Xuất Excel"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* ── Thanh công cụ trên máy tính ── */}
      <div className="hidden flex-wrap items-center gap-1 md:flex 2xl:gap-1.5">
        {!meetingId && <PeriodPicker value={period} onChange={setPeriod} />}

        {scope !== "overview" && (
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList className="h-8 p-0.5">
              <TabsTrigger
                value="list"
                className="h-7 px-2"
                title="Danh sách"
                aria-label="Danh sách"
              >
                <List className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger
                value="board"
                className="h-7 px-2"
                title="Kanban"
                aria-label="Kanban"
              >
                <LayoutGrid className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {scope !== "overview" && view === "list" && (
          <div className="flex items-center gap-1.5">
            <Layers className="hidden h-4 w-4 shrink-0 text-muted-foreground 2xl:block" />
            <Select
              value={groupBy}
              onValueChange={(v) => setGroupBy(v as GroupBy)}
            >
              <SelectTrigger className="h-8 w-auto max-w-[240px] gap-1.5 px-2.5 text-xs 2xl:px-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    Nhóm: {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1 2xl:gap-1.5">
          <Filter className="hidden h-4 w-4 shrink-0 text-muted-foreground 2xl:block" />
          <FilterSelect
            value={departmentFilter}
            onChange={handleDepartmentFilterChange}
            placeholder="Phòng/Nhóm"
            options={DEPARTMENT_OPTIONS}
          />
          <FilterSelect
            value={statusFilter}
            onChange={handleStatusFilterChange}
            placeholder="Trạng thái"
            options={TASK_STATUS_ORDER.map((s) => ({
              value: s,
              label: TASK_STATUS_META[s].label,
            }))}
          />
          <FilterSelect
            value={priorityFilter}
            onChange={handlePriorityFilterChange}
            placeholder="Ưu tiên"
            options={TASK_PRIORITY_ORDER.map((p) => ({
              value: p,
              label: TASK_PRIORITY_META[p].label,
            }))}
          />
          <FilterSelect
            value={assigneeFilter}
            onChange={handleAssigneeFilterChange}
            placeholder="Người làm"
            options={profiles.map((p) => ({
              value: p.id,
              label: p.full_name ?? p.email,
            }))}
          />
          {scope === "overview" && canManageCategories && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs 2xl:px-3"
              onClick={() =>
                setManageDepartment(
                  departmentFilter === ALL || departmentFilter === NO_DEPARTMENT
                    ? null
                    : departmentFilter,
                )
              }
            >
              <Settings2 className="h-4 w-4" /> Hạng mục
            </Button>
          )}
          {!meetingId && (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              title="Xuất Excel"
              aria-label="Xuất Excel"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
            </Button>
          )}
          {meetingId && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setLinkOpen(true)}
            >
              <Link2 className="h-4 w-4" /> Thêm việc có sẵn
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 px-2 text-xs 2xl:px-3"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" /> Tạo công việc
          </Button>
        </div>
      </div>

      {!meetingId && (
        <ScopeBar
          scope={scope}
          department={scopeDepartment}
          categoryName={
            activeCategory?.name ??
            (uncategorizedDept !== undefined ? "Chưa phân hạng mục" : null)
          }
          count={scopedTasks.length}
          onBack={() => openCategory(null)}
          onShowAll={() => openCategory(ALL_TASKS)}
        />
      )}

      {isLoading || (scope === "overview" && categoriesLoading) ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : scope === "overview" && categoriesError ? (
        <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 py-12 text-center">
          <p className="text-sm text-destructive">
            Không thể tải danh sách hạng mục. Vui lòng thử lại.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchCategories()}
          >
            Thử lại
          </Button>
        </div>
      ) : scope === "overview" ? (
        <CategoryOverview
          tasks={visibleTasks}
          categories={categories}
          departmentFilter={departmentFilter === ALL ? null : departmentFilter}
          onOpenCategory={openCategory}
          canManage={canManageCategories}
          onManage={setManageDepartment}
          nameOf={(id) => nameOf(id) ?? ""}
          onOpenTask={openDetail}
          openStat={openStat}
          onOpenStatChange={(s) => {
            setOpenStat(s);
            if (!s) handleDetailOpenChange(false);
          }}
          statSheetChildren={statSheetOpen ? detailPanel : null}
        />
      ) : scopedTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {scope === "category"
              ? "Hạng mục này chưa có công việc nào khớp bộ lọc và kỳ hiện tại."
              : tasks.length === 0
                ? activeFilterCount > 0
                  ? "Không có công việc nào khớp bộ lọc hiện tại."
                  : "Chưa có công việc nào. Bấm Tạo công việc để bắt đầu."
                : "Không có công việc nào trong kỳ này. Đổi bộ lọc kỳ để xem thêm."}
          </p>
        </div>
      ) : view === "board" ? (
        <TaskBoard
          tasks={scopedTasks}
          nameOf={nameOf}
          avatarOf={avatarOf}
          onEdit={openDetail}
          onStatusChange={handleStatusChange}
        />
      ) : (
        <TaskListView
          tasks={scopedTasks}
          groupBy={groupBy}
          profiles={profiles}
          meetings={meetings}
          categories={categories}
          nameOf={nameOf}
          onOpen={openDetail}
          onDelete={handleDelete}
          onPatch={handlePatch}
          canHideWeek={period.mode === "week"}
          onToggleWeekHidden={handleToggleWeekHidden}
          onUnlinkMeeting={
            meetingId
              ? (t) => handlePatch(t.id, { meeting_id: null })
              : undefined
          }
        />
      )}

      {/*
        Nút tạo việc nổi trên điện thoại — đặt trên thanh tab đáy (56px + phần
        an toàn của máy tai thỏ) để không đè lên nhau.
      */}
      <Button
        onClick={() => setCreateOpen(true)}
        aria-label="Tạo công việc"
        className="fixed right-4 z-40 h-14 w-14 rounded-full shadow-lg md:hidden"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 4.5rem)" }}
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* Bộ lọc trên điện thoại */}
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="bottom" className="pb-safe">
          <SheetTitle className="shrink-0 px-4 pb-3 pt-3">
            Lọc &amp; nhóm
          </SheetTitle>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6">
            {scope !== "overview" && view === "list" && (
              <MobileFilterField label="Nhóm theo">
                <Select
                  value={groupBy}
                  onValueChange={(v) => setGroupBy(v as GroupBy)}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GROUP_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </MobileFilterField>
            )}

            <MobileFilterField label="Phòng/Nhóm">
              <MobileFilterSelect
                value={departmentFilter}
                onChange={handleDepartmentFilterChange}
                allLabel="Tất cả phòng/nhóm"
                options={DEPARTMENT_OPTIONS}
              />
            </MobileFilterField>

            <MobileFilterField label="Trạng thái">
              <MobileFilterSelect
                value={statusFilter}
                onChange={handleStatusFilterChange}
                allLabel="Tất cả trạng thái"
                options={TASK_STATUS_ORDER.map((s) => ({
                  value: s,
                  label: TASK_STATUS_META[s].label,
                }))}
              />
            </MobileFilterField>

            <MobileFilterField label="Ưu tiên">
              <MobileFilterSelect
                value={priorityFilter}
                onChange={handlePriorityFilterChange}
                allLabel="Tất cả ưu tiên"
                options={TASK_PRIORITY_ORDER.map((p) => ({
                  value: p,
                  label: TASK_PRIORITY_META[p].label,
                }))}
              />
            </MobileFilterField>

            <MobileFilterField label="Người làm">
              <MobileFilterSelect
                value={assigneeFilter}
                onChange={handleAssigneeFilterChange}
                allLabel="Tất cả người làm"
                options={profiles.map((p) => ({
                  value: p.id,
                  label: p.full_name ?? p.email,
                }))}
              />
            </MobileFilterField>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="h-11 flex-1"
                disabled={activeFilterCount === 0}
                onClick={handleClearFilters}
              >
                Xoá lọc
              </Button>
              <Button
                className="h-11 flex-1"
                onClick={() => setFilterSheetOpen(false)}
              >
                Xem {scopedTasks.length} việc
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {meetingId && (
        <LinkTasksDialog
          open={linkOpen}
          onOpenChange={setLinkOpen}
          meetingId={meetingId}
        />
      )}
      <TaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        meetings={meetings}
        defaultMeetingId={meetingId}
        lockMeeting={!!meetingId}
        defaultDepartment={
          scopeDepartment !== undefined
            ? scopeDepartment
            : departmentFilter !== ALL && departmentFilter !== NO_DEPARTMENT
              ? departmentFilter
              : null
        }
        defaultCategoryId={activeCategory?.id ?? null}
      />
      {manageDepartment !== undefined && (
        <CategoryManagerDialog
          open
          onOpenChange={(v) => !v && setManageDepartment(undefined)}
          department={manageDepartment}
        />
      )}
      {!statSheetOpen && detailPanel}
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title="Xoá công việc?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" sẽ được chuyển vào thùng rác. Quản trị viên có thể khôi phục lại.`
            : undefined
        }
        confirmLabel="Xoá"
        destructive
        onConfirm={() => {
          if (pendingDelete) deleteTask.mutate(pendingDelete.id);
        }}
      />
    </div>
  );
}

/** Breadcrumb above the tasks: overview, one category, or every task. */
function ScopeBar({
  scope,
  department,
  categoryName,
  count,
  onBack,
  onShowAll,
}: {
  scope: "overview" | "all" | "category";
  department: string | null | undefined;
  categoryName: string | null;
  count: number;
  onBack: () => void;
  onShowAll: () => void;
}) {
  if (scope === "overview") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <FolderTree className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">Hạng mục theo phòng/nhóm</span>
        <Button
          variant="link"
          size="sm"
          className="ml-auto h-auto p-0 text-xs"
          onClick={onShowAll}
        >
          Xem toàn bộ công việc
        </Button>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <Button
        variant="outline"
        size="sm"
        className="h-8 shrink-0 px-2"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" /> Hạng mục
      </Button>
      <span className="min-w-0 truncate">
        {scope === "all" ? (
          <span className="font-medium">Toàn bộ công việc</span>
        ) : (
          <>
            <span className="text-muted-foreground">
              {department ?? "Chưa phân phòng"} /{" "}
            </span>
            <span className="font-medium">{categoryName ?? "…"}</span>
          </>
        )}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">{count} việc</span>
    </div>
  );
}

function MobileFilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

/** Giống FilterSelect nhưng cao 40px cho vừa đầu ngón tay. */
function MobileFilterSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto max-w-[240px] gap-1.5 px-2.5 text-xs 2xl:px-3">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Tất cả {placeholder.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
