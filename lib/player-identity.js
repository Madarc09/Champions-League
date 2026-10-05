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

export function buildPlayerIdentityIndex(players = []) {
  const byId = new Map();
  const byIdentity = new Map();
  const byName = new Map();
  const ambiguousNames = new Set();

  for (const player of players || []) {
    const id = String(player?.playerId || "");
    const name = canonicalPlayerName(player?.name);
    const identity = playerIdentityKey(player);

    if (id) byId.set(id, player);
    if (identity) byIdentity.set(identity, player);

    if (name) {
      if (byName.has(name) && byName.get(name)?.playerId !== player?.playerId) {
        ambiguousNames.add(name);
      } else {
        byName.set(name, player);
      }
    }
  }

  return { byId, byIdentity, byName, ambiguousNames };
}

export function resolvePlayerFromIndex(player, index) {
  if (!player || !index) return null;

  const id = String(player?.playerId || "");
  if (id && index.byId?.has(id)) return index.byId.get(id);

  const identity = playerIdentityKey(player);
  if (identity && index.byIdentity?.has(identity)) return index.byIdentity.get(identity);

  const name = canonicalPlayerName(player?.name);
  if (name && !index.ambiguousNames?.has(name) && index.byName?.has(name)) {
    return index.byName.get(name);
  }

  return null;
}

export function resolvePlayerIdentity(player, playersOrIndex) {
  const index = Array.isArray(playersOrIndex)
    ? buildPlayerIdentityIndex(playersOrIndex)
    : playersOrIndex;
  return resolvePlayerFromIndex(player, index);
}
