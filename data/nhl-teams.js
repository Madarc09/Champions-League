const NHL_LOGO_BASE = "https://assets.nhle.com/logos/nhl/svg";

function team(abbrev, name, conference, division) {
  return {
    abbrev,
    name,
    conference,
    division,
    logo: `${NHL_LOGO_BASE}/${abbrev}_light.svg`
  };
}

// Used as the dependable fallback when the live NHL standings feed is unavailable.
// The /api/nhl-teams route refreshes names and logos from NHL.com when possible.
export const NHL_TEAMS_FALLBACK = [
  team("BOS", "Boston Bruins", "East", "Atlantic"),
  team("BUF", "Buffalo Sabres", "East", "Atlantic"),
  team("CAR", "Carolina Hurricanes", "East", "Metropolitan"),
  team("CBJ", "Columbus Blue Jackets", "East", "Metropolitan"),
  team("DET", "Detroit Red Wings", "East", "Atlantic"),
  team("FLA", "Florida Panthers", "East", "Atlantic"),
  team("MTL", "Montréal Canadiens", "East", "Atlantic"),
  team("NJD", "New Jersey Devils", "East", "Metropolitan"),
  team("NYI", "New York Islanders", "East", "Metropolitan"),
  team("NYR", "New York Rangers", "East", "Metropolitan"),
  team("OTT", "Ottawa Senators", "East", "Atlantic"),
  team("PHI", "Philadelphia Flyers", "East", "Metropolitan"),
  team("PIT", "Pittsburgh Penguins", "East", "Metropolitan"),
  team("TBL", "Tampa Bay Lightning", "East", "Atlantic"),
  team("TOR", "Toronto Maple Leafs", "East", "Atlantic"),
  team("WSH", "Washington Capitals", "East", "Metropolitan"),
  team("ANA", "Anaheim Ducks", "West", "Pacific"),
  team("CGY", "Calgary Flames", "West", "Pacific"),
  team("CHI", "Chicago Blackhawks", "West", "Central"),
  team("COL", "Colorado Avalanche", "West", "Central"),
  team("DAL", "Dallas Stars", "West", "Central"),
  team("EDM", "Edmonton Oilers", "West", "Pacific"),
  team("LAK", "Los Angeles Kings", "West", "Pacific"),
  team("MIN", "Minnesota Wild", "West", "Central"),
  team("NSH", "Nashville Predators", "West", "Central"),
  team("SEA", "Seattle Kraken", "West", "Pacific"),
  team("SJS", "San Jose Sharks", "West", "Pacific"),
  team("STL", "St. Louis Blues", "West", "Central"),
  team("UTA", "Utah Mammoth", "West", "Central"),
  team("VAN", "Vancouver Canucks", "West", "Pacific"),
  team("VGK", "Vegas Golden Knights", "West", "Pacific"),
  team("WPG", "Winnipeg Jets", "West", "Central")
].sort((left, right) => left.name.localeCompare(right.name));

export function nhlLogoUrl(abbrev) {
  const normalized = String(abbrev || "").trim().toUpperCase();
  return normalized ? `${NHL_LOGO_BASE}/${normalized}_light.svg` : null;
}
