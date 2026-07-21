import { notFound, redirect } from "next/navigation";
import RosterBuilder from "@/components/RosterBuilder";
import {
  GOALIE_SCORING,
  ROSTER_LIMITS,
  SALARY_CAP,
  SCORING,
  SEASON_LABEL,
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
    <>
      <section className="team-hero">
        <div>
          <a className="back-link" href="/">← Back to standings</a>
          <p className="eyebrow">{SEASON_LABEL} roster builder</p>
          <h1>{team.name}&apos;s Team</h1>
          <p>
            Use the 2025–26 fantasy leaderboard to draft a legal 20-player lineup under the 2026–27 salary cap.
          </p>
        </div>
        <div className="manager-crest">{team.name.slice(0, 1)}</div>
      </section>

      <RosterBuilder
        team={team}
        salaryCap={SALARY_CAP}
        rosterLimits={ROSTER_LIMITS}
        scoring={SCORING}
        goalieScoring={GOALIE_SCORING}
      />
    </>
  );
}
