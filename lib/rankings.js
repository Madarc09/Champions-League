import { RANKING_FALLBACKS } from "@/data/ranking-fallbacks";
import { getPlayerPool } from "@/lib/nhl";
import { getRedis } from "@/lib/redis";

const CACHE_KEY = "champions-league:rankings:2026-27:v2";
const CACHE_SECONDS = 60 * 60 * 8;
const MEMORY_MS = CACHE_SECONDS * 1000;

const SOURCE_DEFINITIONS = {
  nhl: {
    label: "NHL.com",
    season: "2026–27",
    url: "https://www.nhl.com/news/topic/fantasy/nhl-fantasy-hockey-top-250-200-rankings-drafts-players-big-board-281505474"
  },
  espn: {
    label: "ESPN",
    season: "2026–27",
    url: "https://africa.espn.com/fantasy/hockey/story/_/id/49299647/espn-nhl-fantasy-hockey-rankings-forwards-defensemen-goalies-points-leagues"
  },
  yahoo: {
    label: "Yahoo",
    season: "Latest pre-rank",
    url: "https://hockey.fantasysports.yahoo.com/hockey/public_prerank"
  },
  cbs: {
    label: "CBS",
    season: "Top 200",
    url: "https://www.cbssports.com/fantasy/hockey/rankings/"
  },
  champions: {
    label: "Champions",
    season: "2025–26 results",
    url: null
  }
};

let memoryCache = null;

export function canonicalRankingName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-zA-Z0-9' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&uuml;/gi, "ü")
    .replace(/&ouml;/gi, "ö")
    .replace(/&eacute;/gi, "é")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function htmlToText(html) {
  return decodeHtml(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>|<\/li>|<\/div>|<\/tr>|<\/h\d>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

async function fetchText(url, timeoutMs = 14000, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { headers: extraHeaders = {}, ...requestOptions } = options;
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      ...requestOptions,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; ChampionsLeagueFantasy/1.0)",
        ...extraHeaders
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

function addRank(map, rawName, rank) {
  const name = canonicalRankingName(rawName);
  const number = Number(rank);
  if (!name || !Number.isInteger(number) || number < 1 || number > 1000) return;
  if (!map[name] || number < map[name]) map[name] = number;
}

function parseNhlRankings(html) {
  const text = htmlToText(html);
  const ranks = {};
  const pattern = /(?:^|\n|\s)(\d{1,3})\.\s+([A-ZÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'’ -]{1,48}?),\s*(?:F|D|G),\s*[A-Z]{2,3}\b/g;
  for (const match of text.matchAll(pattern)) addRank(ranks, match[2], match[1]);
  return ranks;
}

function parseEspnArticle(html) {
  const text = htmlToText(html);
  const ranks = {};
  const patterns = [
    /(?:^|\n|\s)(\d{1,3})\.\s+([A-ZÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'’ -]{1,48}?),\s*[A-Z]{2,3}\s*\([A-Z]{1,3}\d+\)/g,
    /(?:^|\n|\s)(\d{1,3})\.\s+([A-ZÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'’ -]{1,48}?),\s*[A-Za-z .'-]+,\s*[A-Z]{1,3}\d+/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) addRank(ranks, match[2], match[1]);
  }
  return ranks;
}

async function fetchEspnApiRanks() {
  const url = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/fhl/seasons/2027/segments/0/leaguedefaults/1?view=kona_player_info";
  const filter = {
    players: {
      limit: 1500,
      sortDraftRanks: { sortPriority: 1, sortAsc: true, value: "STANDARD" }
    }
  };
  const raw = await fetchText(url, 16000, {
    headers: {
      Accept: "application/json",
      "x-fantasy-filter": JSON.stringify(filter)
    }
  });
  const payload = JSON.parse(raw);
  const entries = Array.isArray(payload?.players) ? payload.players : [];
  const ranks = {};
  for (const entry of entries) {
    const player = entry?.player || entry;
    const rank =
      player?.draftRanksByRankType?.STANDARD?.rank ||
      player?.draftRanksByRankType?.PPR?.rank ||
      player?.rankings?.[0]?.rank;
    addRank(ranks, player?.fullName, rank);
  }
  return ranks;
}

function parseYahooRankings(html) {
  const text = htmlToText(html);
  if (/collectConsent|privacy choices|consent\.yahoo/i.test(text)) return {};
  const ranks = {};
  const patterns = [
    /(?:^|\n|\s)(\d{1,3})\.\s+([A-ZÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'’ -]{1,48}?)\s*\(\$\d+/g,
    /(?:^|\n|\s)(\d{1,3})\s+([A-ZÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'’ -]{1,48}?)\s+(?:C|LW|RW|D|G)\b/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) addRank(ranks, match[2], match[1]);
  }
  return ranks;
}

function parseCbsRankings(html, knownPlayers) {
  const text = htmlToText(html);
  const initialSurnameRanks = new Map();
  const pattern = /(?:^|\n|\s)(\d{1,3})\s+(?:Image\s+)?([A-Z])\.\s+([A-Za-zÀ-ÖØ-öø-ÿ'’-]+)\s+(?:C|LW|RW|D|G)\b/g;
  for (const match of text.matchAll(pattern)) {
    const key = `${match[2].toLowerCase()}|${canonicalRankingName(match[3])}`;
    if (!initialSurnameRanks.has(key)) initialSurnameRanks.set(key, Number(match[1]));
  }

  const ranks = {};
  for (const fullName of knownPlayers) {
    const normalized = canonicalRankingName(fullName);
    const pieces = normalized.split(" ").filter(Boolean);
    if (pieces.length < 2) continue;
    const key = `${pieces[0][0]}|${pieces.at(-1)}`;
    const rank = initialSurnameRanks.get(key);
    if (rank) ranks[normalized] = rank;
  }
  return ranks;
}

function mergeFallback(live, fallback) {
  return { ...(fallback || {}), ...(live || {}) };
}

function sourceStatus(result, fallback) {
  const liveCount = Object.keys(result || {}).length;
  const totalCount = Object.keys(mergeFallback(result, fallback)).length;
  return {
    live: liveCount > 0,
    liveCount,
    recordCount: totalCount
  };
}

function createChampionsRanks(players) {
  const sorted = [...players].sort((a, b) => {
    const points = Number(b.fantasyPoints || 0) - Number(a.fantasyPoints || 0);
    if (points !== 0) return points;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  const ranks = {};
  let previousPoints = null;
  let currentRank = 0;
  sorted.forEach((player, index) => {
    const points = Number(player.fantasyPoints || 0);
    if (previousPoints === null || points !== previousPoints) currentRank = index + 1;
    previousPoints = points;
    addRank(ranks, player.name, currentRank);
  });
  return ranks;
}

async function buildSnapshot() {
  const playerPool = await getPlayerPool();
  const knownPlayers = playerPool.players.map((player) => player.name).filter(Boolean);

  const [nhlResult, espnArticleResult, espnApiResult, yahooResult, cbsResult] = await Promise.allSettled([
    fetchText(SOURCE_DEFINITIONS.nhl.url).then(parseNhlRankings),
    fetchText(SOURCE_DEFINITIONS.espn.url).then(parseEspnArticle),
    fetchEspnApiRanks(),
    fetchText(SOURCE_DEFINITIONS.yahoo.url).then(parseYahooRankings),
    fetchText(SOURCE_DEFINITIONS.cbs.url).then((html) => parseCbsRankings(html, knownPlayers))
  ]);

  const nhlLive = nhlResult.status === "fulfilled" ? nhlResult.value : {};
  const espnArticle = espnArticleResult.status === "fulfilled" ? espnArticleResult.value : {};
  const espnApi = espnApiResult.status === "fulfilled" ? espnApiResult.value : {};
  const yahooLive = yahooResult.status === "fulfilled" ? yahooResult.value : {};
  const cbsLive = cbsResult.status === "fulfilled" ? cbsResult.value : {};
  const espnLive = { ...espnArticle, ...espnApi };

  const rankings = {
    nhl: mergeFallback(nhlLive, RANKING_FALLBACKS.nhl),
    espn: mergeFallback(espnLive, RANKING_FALLBACKS.espn),
    yahoo: mergeFallback(yahooLive, RANKING_FALLBACKS.yahoo),
    cbs: mergeFallback(cbsLive, RANKING_FALLBACKS.cbs),
    champions: createChampionsRanks(playerPool.players)
  };

  return {
    updatedAt: new Date().toISOString(),
    rankings,
    sources: {
      nhl: { ...SOURCE_DEFINITIONS.nhl, ...sourceStatus(nhlLive, RANKING_FALLBACKS.nhl) },
      espn: { ...SOURCE_DEFINITIONS.espn, ...sourceStatus(espnLive, RANKING_FALLBACKS.espn) },
      yahoo: { ...SOURCE_DEFINITIONS.yahoo, ...sourceStatus(yahooLive, RANKING_FALLBACKS.yahoo) },
      cbs: { ...SOURCE_DEFINITIONS.cbs, ...sourceStatus(cbsLive, RANKING_FALLBACKS.cbs) },
      champions: {
        ...SOURCE_DEFINITIONS.champions,
        live: true,
        liveCount: Object.keys(rankings.champions).length,
        recordCount: Object.keys(rankings.champions).length
      }
    }
  };
}

function cacheFresh(snapshot) {
  const time = new Date(snapshot?.updatedAt || 0).getTime();
  return Number.isFinite(time) && Date.now() - time < MEMORY_MS;
}

export async function getRankingSnapshot({ force = false } = {}) {
  if (!force && memoryCache && cacheFresh(memoryCache)) return memoryCache;

  const redis = getRedis();
  if (!force && redis) {
    try {
      const saved = await redis.get(CACHE_KEY);
      if (saved && cacheFresh(saved)) {
        memoryCache = saved;
        return saved;
      }
    } catch (error) {
      console.error("Ranking cache read failed:", error);
    }
  }

  try {
    const snapshot = await buildSnapshot();
    memoryCache = snapshot;
    if (redis) {
      try {
        await redis.set(CACHE_KEY, snapshot, { ex: CACHE_SECONDS });
      } catch (error) {
        console.error("Ranking cache write failed:", error);
      }
    }
    return snapshot;
  } catch (error) {
    if (memoryCache) return { ...memoryCache, stale: true, warning: error.message };
    throw error;
  }
}

export function pickPlayerRankings(snapshot, name) {
  const key = canonicalRankingName(name);
  return {
    nhl: snapshot?.rankings?.nhl?.[key] || null,
    espn: snapshot?.rankings?.espn?.[key] || null,
    yahoo: snapshot?.rankings?.yahoo?.[key] || null,
    cbs: snapshot?.rankings?.cbs?.[key] || null,
    champions: snapshot?.rankings?.champions?.[key] || null
  };
}

export { SOURCE_DEFINITIONS };
