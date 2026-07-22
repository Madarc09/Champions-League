// Verified 2026-27 contracts used as deterministic safeguards when a public
// team page has not yet reflected a signing or a player's row changes markup.
// These are merged by canonical name after the all-32-team source audit.
const TRACKER = "https://www.nhl.com/news/topic/free-agency/2026-nhl-free-agent-tracker";

export const VERIFIED_SALARY_CORRECTIONS_BY_NAME = {
  adamfox: {
    playerId: "8479323", name: "Adam Fox", teamAbbreviation: "NYR", position: "D", capHit: 9_500_000,
    source: "CapWages verified contract safeguard",
    sourceUrl: "https://capwages.com/players/adam-fox",
    contractSignedDate: "2021-11-01", verifiedAt: "2026-07-22"
  },
  jasonrobertson: {
    playerId: "8480027", name: "Jason Robertson", teamAbbreviation: "DAL", position: "LW", capHit: 12_000_000,
    source: "NHL.com verified correction",
    sourceUrl: "https://www.nhl.com/news/topic/free-agency/jason-robertson-signs-1-year-contract-with-dallas-stars",
    contractSignedDate: "2026-07-21", verifiedAt: "2026-07-22"
  },
  trevorzegras: { name: "Trevor Zegras", teamAbbreviation: "PHI", position: "F", capHit: 9_125_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  jamiedrysdale: { name: "Jamie Drysdale", teamAbbreviation: "PHI", position: "D", capHit: 6_500_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  connorbedard: { name: "Connor Bedard", teamAbbreviation: "CHI", position: "C", capHit: 15_000_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  anthonymantha: { name: "Anthony Mantha", teamAbbreviation: "NJD", position: "RW", capHit: 4_750_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  connormcmichael: { name: "Connor McMichael", teamAbbreviation: "STL", position: "C", capHit: 6_750_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  oskarsundqvist: { name: "Oskar Sundqvist", teamAbbreviation: "STL", position: "C", capHit: 850_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  kirbydach: { name: "Kirby Dach", teamAbbreviation: "MTL", position: "C", capHit: 3_600_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  coleperfetti: { name: "Cole Perfetti", teamAbbreviation: "WPG", position: "LW", capHit: 6_000_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  bradenschneider: { name: "Braden Schneider", teamAbbreviation: "NYR", position: "D", capHit: 5_500_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  peytonkrebs: { name: "Peyton Krebs", teamAbbreviation: "BUF", position: "C", capHit: 4_500_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  coltondach: { name: "Colton Dach", teamAbbreviation: "EDM", position: "LW", capHit: 1_200_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  leocarlsson: { name: "Leo Carlsson", teamAbbreviation: "ANA", position: "C", capHit: 18_000_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  barretthayton: { name: "Barrett Hayton", teamAbbreviation: "UTA", position: "C", capHit: 4_775_000, source: "NHL.com 2026 contract audit", sourceUrl: TRACKER, verifiedAt: "2026-07-22" },
  gavinmckenna: {
    name: "Gavin McKenna", teamAbbreviation: "TOR", position: "LW", capHit: 1_075_000,
    source: "NHL.com verified rookie safeguard",
    sourceUrl: "https://www.nhl.com/news/gavin-mckenna-signs-entry-level-contract-with-toronto-maple-leafs",
    contractSignedDate: "2026-07-03", verifiedAt: "2026-07-22"
  }
};

export const REQUIRED_SALARY_GUARDS = Object.fromEntries(
  Object.entries(VERIFIED_SALARY_CORRECTIONS_BY_NAME).map(([key, record]) => [key, record.capHit])
);
