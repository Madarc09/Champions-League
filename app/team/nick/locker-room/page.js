import { redirect } from "next/navigation";
import LockerRoom from "@/components/LockerRoom";
import { TEAMS } from "@/data/league-config";
import { currentManager } from "@/lib/auth";

const team = TEAMS.find((item) => item.slug === "nick");

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nick's Locker Room | Champions League",
  description: "Nick's private Champions League projected roster."
};

export default async function NickLockerRoomPage() {
  const manager = await currentManager();
  if (!manager) redirect("/login?next=/team/nick/locker-room");
  if (manager.slug !== "nick") redirect(`/team/${manager.slug}/locker-room`);

  return (
    <div className="locker-page-root">
      <LockerRoom team={team} />
    </div>
  );
}
