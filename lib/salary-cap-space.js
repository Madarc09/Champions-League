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
  return team === "ARI" ? "UTA" : team;
}

const records = Array.isArray(SALARY_CAP_SPACE.records) ? SALARY_CAP_SPACE.records : [];
const byPlayerId = new Map();
const byTeamAndName = new Map();
const candidatesByName = new Map();

for (const record of records) {
  if (record?.playerId != null) byPlayerId.set(String(record.playerId), record);
  const nameKey = canonicalName(record?.name);
  const teamKey = `${normalizeTeam(record?.team)}:${nameKey}`;
  if (nameKey) {
    byTeamAndName.set(teamKey, record);
    if (!candidatesByName.has(nameKey)) candidatesByName.set(nameKey, []);
    candidatesByName.get(nameKey).push(record);
  }
}

export function salaryCapSpaceRecordFor(player) {
  const idMatch = byPlayerId.get(String(player?.playerId));
  if (idMatch) return idMatch;

  const nameKey = canonicalName(player?.name);
  const teamMatch = byTeamAndName.get(`${normalizeTeam(player?.team)}:${nameKey}`);
  if (teamMatch) return teamMatch;

  const candidates = candidatesByName.get(nameKey) || [];
  return candidates.length === 1 ? candidates[0] : null;
}

export function salaryCapSpaceSnapshot() {
  return SALARY_CAP_SPACE;
}

export function salaryCapSpaceRecords() {
  return records;
}
