import { TEAMS } from "@/data/league-config";

export function rosterStorageKey(teamSlug) {
  return `champions-league:roster:${teamSlug}:2026-27`;
}

function rosterPlayers(roster) {
  return Array.isArray(roster?.players) ? roster.players : [];
}

export function rosterFantasyTotal(roster, liveFantasyPoints = {}) {
  const total = rosterPlayers(roster).reduce((sum, player) => {
    const playerId = String(player?.playerId || "");
    const liveValue = liveFantasyPoints[playerId];
    const points = liveValue == null ? Number(player?.fantasyPoints || 0) : Number(liveValue || 0);
    return sum + (Number.isFinite(points) ? points : 0);
  }, 0);

  return Math.round(total * 10) / 10;
}

export function rosterProjectedTotal(roster, liveProjectedPoints = {}) {
  const total = rosterPlayers(roster).reduce((sum, player) => {
    const playerId = String(player?.playerId || "");
    const liveValue = liveProjectedPoints[playerId];
    const savedValue = player?.projection?.fantasyPoints;
    const points = liveValue == null ? Number(savedValue || 0) : Number(liveValue || 0);
    return sum + (Number.isFinite(points) ? points : 0);
  }, 0);

  return Math.round(total * 10) / 10;
}

export function buildLeagueStandings(rostersByTeam = {}, liveFantasyPoints = {}, liveProjectedPoints = {}) {
  return TEAMS
    .map((team, originalIndex) => ({
      ...team,
      originalIndex,
      fantasyPoints: rosterFantasyTotal(rostersByTeam[team.slug], liveFantasyPoints),
      projectedFantasyPoints: rosterProjectedTotal(rostersByTeam[team.slug], liveProjectedPoints)
    }))
    .sort((left, right) => (
      right.fantasyPoints - left.fantasyPoints
      || left.originalIndex - right.originalIndex
    ))
    .map(({ originalIndex: _originalIndex, ...team }, index) => ({
      ...team,
      rank: index + 1
    }));
}

export function ordinal(value) {
  const number = Number(value || 0);
  const lastTwo = number % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${number}th`;
  switch (number % 10) {
    case 1: return `${number}st`;
    case 2: return `${number}nd`;
    case 3: return `${number}rd`;
    default: return `${number}th`;
  }
}

export function newerRoster(serverRoster, localRoster) {
  if (!serverRoster) return localRoster || null;
  if (!localRoster) return serverRoster;

  const serverTime = Date.parse(serverRoster.updatedAt || "") || 0;
  const localTime = Date.parse(localRoster.updatedAt || "") || 0;
  return localTime > serverTime ? localRoster : serverRoster;
}
