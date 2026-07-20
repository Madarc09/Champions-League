import LockerRoom from "@/components/LockerRoom";
import { TEAMS } from "@/data/league-config";

const team = TEAMS.find((item) => item.slug === "nick");

export const metadata = {
  title: "Nick's Locker Room | Champions League",
  description: "Nick's Champions League projected roster inside his custom locker."
};

export default function NickLockerRoomPage() {
  return (
    <div className="locker-page-root">
      <LockerRoom team={team} />
    </div>
  );
}
