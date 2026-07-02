import { MeetingsList } from "@/modules/meetings/meetings-list";

export default function MeetingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Họp giao ban
        </h1>
        <p className="text-sm text-muted-foreground">
          Danh sách cuộc họp giao ban.
        </p>
      </div>
      <MeetingsList />
    </div>
  );
}
