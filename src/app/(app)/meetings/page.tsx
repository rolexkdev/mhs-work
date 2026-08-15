import { MeetingsList } from "@/modules/meetings/meetings-list";

export default function MeetingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Họp giao ban
        </h1>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Danh sách cuộc họp giao ban.
        </p>
      </div>
      <MeetingsList />
    </div>
  );
}
