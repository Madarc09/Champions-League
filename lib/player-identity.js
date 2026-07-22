export function canonicalPlayerName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/i, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function canonicalBirthDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function playerIdentityKey(player) {
  const name = canonicalPlayerName(player?.name);
  const birthDate = canonicalBirthDate(player?.birthDate);
  return birthDate ? `${name}|${birthDate}` : name;
}

export function samePlayerIdentity(left, right) {
  const leftName = canonicalPlayerName(left?.name);
  const rightName = canonicalPlayerName(right?.name);
  if (!leftName || leftName !== rightName) return false;

  const leftBirthDate = canonicalBirthDate(left?.birthDate);
  const rightBirthDate = canonicalBirthDate(right?.birthDate);
  return !leftBirthDate || !rightBirthDate || leftBirthDate === rightBirthDate;
}

export function preferPlayerRecord(left, right) {
  const leftGames = Number(left?.gamesPlayed || 0);
  const rightGames = Number(right?.gamesPlayed || 0);
  if (rightGames !== leftGames) return rightGames > leftGames ? right : left;

  const leftOfficial = Number(left?.playerId) > 0;
  const rightOfficial = Number(right?.playerId) > 0;
  if (rightOfficial !== leftOfficial) return rightOfficial ? right : left;

  const leftMedia = Number(Boolean(left?.headshot)) + Number(Boolean(left?.teamLogo));
  const rightMedia = Number(Boolean(right?.headshot)) + Number(Boolean(right?.teamLogo));
  if (rightMedia !== leftMedia) return rightMedia > leftMedia ? right : left;

  return left;
}
