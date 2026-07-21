import { notFound } from "next/navigation";
import LockerRoom from "@/components/LockerRoom";
import { TEAMS } from "@/data/league-config";
import { currentManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { team: slug } = await params;
  const team = TEAMS.find((item) => item.slug === slug);

  if (!team) return {};

  return {
    title: `${team.name}'s Locker Room | Champions League`,
    description: `${team.name}'s Champions League Locker Room. Roster selections are visible only to that manager.`
  };
}

export default async function TeamLockerRoomPage({ params }) {
  const { team: slug } = await params;
  const team = TEAMS.find((item) => item.slug === slug);
  if (!team || team.slug === "nick") notFound();

  const manager = await currentManager();

  return (
    <div className="locker-page-root">
      <LockerRoom team={team} viewerSlug={manager?.slug || null} />
    </div>
  );
}
