import { MeetingsList } from "@/modules/meetings/meetings-list";

export default function MeetingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Họp giao ban
        </h1>
        <p className="text-sm text-muted-foreground">
          Mỗi cuộc họp tuần/tháng là nơi giao việc — task phát sinh từ đây.
        </p>
      </div>
      <MeetingsList />
    </div>
  );
}
