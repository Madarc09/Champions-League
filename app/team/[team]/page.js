import { notFound, redirect } from "next/navigation";
import RosterBuilder from "@/components/RosterBuilder";
import {
  GOALIE_SCORING,
  ROSTER_LIMITS,
  SALARY_CAP,
  SCORING,
  TEAMS
} from "@/data/league-config";
import { currentManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }) {
  const { team: slug } = await params;
  const team = TEAMS.find((item) => item.slug === slug);
  if (!team) notFound();

  const manager = await currentManager();
  if (!manager) redirect(`/login?next=/team/${slug}`);
  if (manager.slug !== slug) redirect(`/team/${manager.slug}`);

  return (
    <RosterBuilder
      team={team}
      salaryCap={SALARY_CAP}
      rosterLimits={ROSTER_LIMITS}
      scoring={SCORING}
      goalieScoring={GOALIE_SCORING}
    />
  );
}
