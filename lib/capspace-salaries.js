const CAPSPACE_BASE = "https://cap-space.com";
const TARGET_SEASON = "2026-2027";
const CACHE_SECONDS = 60 * 60 * 12;

function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/[$,\s]/g, "");
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function seasonTextMatches(value) {
  if (value == null) return false;

  if (typeof value === "object") {
    return Object.values(value).some(seasonTextMatches);
  }

  const text = String(value).toLowerCase();
  const digits = text.replace(/[^0-9]/g, "");
  return (
    digits.includes("20262027") ||
    text.includes("2026-2027") ||
    text.includes("2026–2027") ||
    text.includes("2026-27") ||
    text.includes("2026/27")
  );
}

function objectSeasonMatches(object) {
  return Object.entries(object).some(([key, value]) => {
    const normalized = normalizeKey(key);
    return normalized.includes("season") && seasonTextMatches(value);
  });
}

function findSeasonCapHit(payload) {
  const candidates = [];

  function visit(value, path = "") {
    if (!value || typeof value !== "object") return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    if (objectSeasonMatches(value)) {
      const capHitEntry = Object.entries(value).find(([key]) => {
        const normalized = normalizeKey(key);
        return normalized === "caphit" || normalized === "projectedcaphit";
      });
      const aavEntry = Object.entries(value).find(([key]) => normalizeKey(key) === "aav");
      const selected = capHitEntry || aavEntry;
      const amount = selected ? parseMoney(selected[1]) : null;

      if (amount && amount > 0 && amount <= 30_000_000) {
        let score = capHitEntry ? 20 : 10;
        if (/current/i.test(path)) score += 5;
        if (/contract.?year/i.test(path)) score += 3;
        if (value.terminated === true || value.bought_out === true || value.boughtOut === true) score -= 20;
        candidates.push({ amount, score });
      }
    }

    Object.entries(value).forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
  }

  visit(payload);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.amount || null;
}

function slugifyPlayerName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.'’]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function parseSeasonFromHtml(html) {
  const text = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ");

  const seasonIndex = text.search(/2026\s*[-–/]\s*(?:2027|27)/i);
  if (seasonIndex < 0) return null;

  const seasonRow = text.slice(seasonIndex, seasonIndex + 400);
  const match = seasonRow.match(/\$\s*([0-9]{3,}(?:,[0-9]{3})*)/);
  if (!match) return null;

  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 && amount <= 30_000_000 ? amount : null;
}

async function fetchCapSpaceJson(playerId) {
  const response = await fetch(`${CAPSPACE_BASE}/api/person/${playerId}`, {
    next: { revalidate: CACHE_SECONDS },
    headers: {
      Accept: "application/json",
      "User-Agent": "Champions-League-Fantasy-Hockey/1.0"
    }
  });

  if (!response.ok) return null;
  const payload = await response.json();
  return findSeasonCapHit(payload);
}

async function fetchCapSpaceHtml(name) {
  const slug = slugifyPlayerName(name);
  if (!slug) return null;

  const response = await fetch(`${CAPSPACE_BASE}/person/${slug}`, {
    next: { revalidate: CACHE_SECONDS },
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Champions-League-Fantasy-Hockey/1.0"
    }
  });

  if (!response.ok) return null;
  return parseSeasonFromHtml(await response.text());
}

export async function lookupCapSpaceSalary(player) {
  const playerId = Number(player?.playerId);
  const name = String(player?.name || "").trim();
  if (!Number.isInteger(playerId) || !name) return null;

  let capHit = null;

  try {
    capHit = await fetchCapSpaceJson(playerId);
  } catch (error) {
    console.error(`CapSpace API lookup failed for ${name}:`, error);
  }

  if (!capHit) {
    try {
      capHit = await fetchCapSpaceHtml(name);
    } catch (error) {
      console.error(`CapSpace page fallback failed for ${name}:`, error);
    }
  }

  if (!capHit) return null;

  return {
    playerId,
    name,
    capHit,
    season: TARGET_SEASON,
    source: "CapSpace",
    updatedAt: new Date().toISOString()
  };
}
