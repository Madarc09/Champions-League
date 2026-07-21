import LockerRoom from "@/components/LockerRoom";
import { TEAMS } from "@/data/league-config";
import { currentManager } from "@/lib/auth";

const team = TEAMS.find((item) => item.slug === "nick");

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nick's Locker Room | Champions League",
  description: "Nick's Champions League Locker Room. Roster selections are visible only to Nick."
};

export default async function NickLockerRoomPage() {
  const manager = await currentManager();

  return (
    <div className="locker-page-root">
      <LockerRoom team={team} viewerSlug={manager?.slug || null} />
    </div>
  );
}
