import { SCORING } from "@/data/league-config";

export function calculateFantasyPoints(player) {
  if (player.rosterType === "G") return null;

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
