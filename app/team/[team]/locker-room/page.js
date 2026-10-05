import { notFound } from "next/navigation";
import LockerRoom from "@/components/LockerRoom";
import { PUBLIC_TEAMS } from "@/data/league-config";
import { currentManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { team: slug } = await params;
  const team = PUBLIC_TEAMS.find((item) => item.slug === slug);

  if (!team) return {};

  return {
    title: `${team.name}'s Locker Room | Champions League`,
    description: team.description || `${team.name}'s locked 2026–27 Champions League roster.`
  };
}

export default async function TeamLockerRoomPage({ params }) {
  const { team: slug } = await params;
  const team = PUBLIC_TEAMS.find((item) => item.slug === slug);
  if (!team || team.slug === "nick") notFound();

  const manager = await currentManager();

  return (
    <div className="locker-page-root">
      <LockerRoom team={team} viewerSlug={manager?.slug || null} />
    </div>
  );
}
