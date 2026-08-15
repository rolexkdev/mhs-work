import { DailyUpdates } from "@/modules/updates/daily-updates";

export default function UpdatesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Báo cáo công việc hằng ngày
        </h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Theo dõi từng ngày ai đã cập nhật tiến độ công việc, kèm nội dung.
        </p>
      </div>
      <DailyUpdates />
    </div>
  );
}
