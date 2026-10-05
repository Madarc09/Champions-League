import { nhlLogoUrl } from "@/data/nhl-teams";

function team(abbrev, name, conference, division) {
  return { abbrev, name, conference, division, logo: nhlLogoUrl(abbrev) };
}

function player(playerId, name, teamAbbrev, rosterType, position, extra = {}) {
  return {
    playerId,
    name,
    team: teamAbbrev,
    rosterType,
    position,
    headshot: `https://assets.nhle.com/mugs/nhl/20262027/${teamAbbrev}/${playerId}.png`,
    teamLogo: nhlLogoUrl(teamAbbrev),
    rookie: false,
    draftYear: null,
    gamesPlayed: 0,
    ...extra
  };
}

// Locked before-season predictions for the AI entrant. These intentionally do
// not use any 2026-27 game results; they are based on the preseason outlook.
export const BOT_PRESEASON_PREDICTIONS = {
  teamAwards: {
    stanleyCup: team("COL", "Colorado Avalanche", "West", "Central"),
    presidentsTrophy: team("COL", "Colorado Avalanche", "West", "Central"),
    westChamp: team("COL", "Colorado Avalanche", "West", "Central"),
    eastChamp: team("FLA", "Florida Panthers", "East", "Atlantic")
  },
  playerAwards: {
    artRoss: player(8478402, "Connor McDavid", "EDM", "F", "C"),
    hart: player(8478402, "Connor McDavid", "EDM", "F", "C"),
    rocket: player(8477934, "Leon Draisaitl", "EDM", "F", "C"),
    vezina: player(8476883, "Andrei Vasilevskiy", "TBL", "G", "G"),
    calder: player(8486067, "Gavin McKenna", "TOR", "F", "LW", { rookie: true, draftYear: 2026 }),
    norris: player(8480069, "Cale Makar", "COL", "D", "D")
  },
  locked: true,
  basis: "Preseason-only predictions made from information available before the 2026-27 regular season began."
};
