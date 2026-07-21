import { notFound, redirect } from "next/navigation";
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
    description: `${team.name}'s private Champions League projected roster.`
  };
}

export default async function TeamLockerRoomPage({ params }) {
  const { team: slug } = await params;
  const team = TEAMS.find((item) => item.slug === slug);
  if (!team || team.slug === "nick") notFound();

  const manager = await currentManager();
  if (!manager) redirect(`/login?next=/team/${slug}/locker-room`);
  if (manager.slug !== slug) redirect(`/team/${manager.slug}/locker-room`);

  return (
    <div className="locker-page-root">
      <LockerRoom team={team} />
    </div>
  );
}
