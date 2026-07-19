import { notFound } from "next/navigation";
import RosterBuilder from "@/components/RosterBuilder";
import {
  ROSTER_LIMITS,
  SALARY_CAP,
  SCORING,
  SEASON_LABEL,
  TEAMS
} from "@/data/league-config";

export function generateStaticParams() {
  return TEAMS.map((team) => ({ team: team.slug }));
}

export default async function TeamPage({ params }) {
  const { team: slug } = await params;
  const team = TEAMS.find((item) => item.slug === slug);
  if (!team) notFound();

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
      />
    </>
  );
}
