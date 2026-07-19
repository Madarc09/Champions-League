import { GOALIE_SCORING, SCORING } from "@/data/league-config";

export function calculateFantasyPoints(player) {
  if (player.rosterType === "G") {
    const saves = Number(player.saves || 0);
    const goalsAgainst = Number(player.goalsAgainst || 0);
    const wins = Number(player.wins || 0);
    const goals = Number(player.goals || 0);
    const assists = Number(player.assists || 0);

    return Number(
      (
        saves * GOALIE_SCORING.saves +
        goalsAgainst * GOALIE_SCORING.goalsAgainst +
        wins * GOALIE_SCORING.wins +
        goals * GOALIE_SCORING.goals +
        assists * GOALIE_SCORING.assists
      ).toFixed(2)
    );
  }

  const goals = Number(player.goals || 0);
  const assists = Number(player.assists || 0);
  const hits = Number(player.hits || 0);
  const shots = Number(player.shots || 0);

  return Number(
    (
      goals * SCORING.goals +
      assists * SCORING.assists +
      hits * SCORING.hits +
      shots * SCORING.shots
    ).toFixed(1)
  );
}
