import { notFound } from "next/navigation";
import LockerRoom from "@/components/LockerRoom";
import { TEAMS } from "@/data/league-config";

export function generateStaticParams() {
  return TEAMS
    .filter((team) => team.slug !== "nick")
    .map((team) => ({ team: team.slug }));
}

export async function generateMetadata({ params }) {
  const { team: slug } = await params;
  const team = TEAMS.find((item) => item.slug === slug);

  if (!team) return {};

  return {
    title: `${team.name}'s Locker Room | Champions League`,
    description: `${team.name}'s Champions League projected roster inside a custom locker.`
  };
}

export default async function TeamLockerRoomPage({ params }) {
  const { team: slug } = await params;
  const team = TEAMS.find((item) => item.slug === slug);
  if (!team || team.slug === "nick") notFound();

  return (
    <div className="locker-page-root">
      <LockerRoom team={team} />
    </div>
  );
}
