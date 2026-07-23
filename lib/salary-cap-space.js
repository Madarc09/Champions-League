import SALARY_CAP_SPACE from "@/data/SALARY_CAP_SPACE.json";

function canonicalName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/gi, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

function normalizeTeam(value) {
  const team = String(value || "").trim().toUpperCase();
  const aliases = {
    ARI: "UTA",
    NAS: "NSH",
    NSH: "NSH",
    WAS: "WSH",
    WSH: "WSH"
  };
  return aliases[team] || team;
}

function normalizePosition(value) {
  const position = String(value || "F").trim().toUpperCase();
  if (position === "D") return "D";
  if (position === "G") return "G";
  return "F";
}

const records = Array.isArray(SALARY_CAP_SPACE.records) ? SALARY_CAP_SPACE.records : [];
const byPlayerId = new Map();
const byTeamNamePosition = new Map();
const candidatesByTeamAndName = new Map();
const candidatesByNameAndPosition = new Map();
const candidatesByName = new Map();

function addCandidate(map, key, record) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(record);
}

for (const record of records) {
  if (record?.playerId != null) byPlayerId.set(String(record.playerId), record);

  const nameKey = canonicalName(record?.name);
  const team = normalizeTeam(record?.team);
  const position = normalizePosition(record?.position);
  if (!nameKey) continue;

  byTeamNamePosition.set(`${team}:${nameKey}:${position}`, record);
  addCandidate(candidatesByTeamAndName, `${team}:${nameKey}`, record);
  addCandidate(candidatesByNameAndPosition, `${nameKey}:${position}`, record);
  addCandidate(candidatesByName, nameKey, record);
}

function uniqueCandidate(map, key) {
  const candidates = map.get(key) || [];
  return candidates.length === 1 ? candidates[0] : null;
}

export function salaryCapSpaceRecordFor(player) {
  const idMatch = byPlayerId.get(String(player?.playerId));
  if (idMatch) return idMatch;

  const nameKey = canonicalName(player?.name);
  if (!nameKey) return null;

  const team = normalizeTeam(player?.team);
  const position = normalizePosition(player?.rosterType || player?.position);

  const exactMatch = byTeamNamePosition.get(`${team}:${nameKey}:${position}`);
  if (exactMatch) return exactMatch;

  const teamAndNameMatch = uniqueCandidate(candidatesByTeamAndName, `${team}:${nameKey}`);
  if (teamAndNameMatch) return teamAndNameMatch;

  const nameAndPositionMatch = uniqueCandidate(candidatesByNameAndPosition, `${nameKey}:${position}`);
  if (nameAndPositionMatch) return nameAndPositionMatch;

  return uniqueCandidate(candidatesByName, nameKey);
}

export function salaryCapSpaceSnapshot() {
  return SALARY_CAP_SPACE;
}

export function salaryCapSpaceRecords() {
  return records;
}
