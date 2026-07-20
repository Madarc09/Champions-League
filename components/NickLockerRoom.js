"use client";

import { useEffect, useMemo, useState } from "react";
import { GOALIE_SCORING, SCORING } from "@/data/league-config";

const TEAM_SLUG = "nick";
const FALLBACK_HEADSHOT = "/player-silhouette.svg";
const EMPTY_SLOT_SILHOUETTE = "/empty-slot-silhouette.svg";
const SLOT_LIMITS = { F: 12, D: 6, G: 2 };
const RANKING_SOURCE_ORDER = ["nhl", "espn", "yahoo", "cbs", "champions"];
const RANKING_LABELS = {
  nhl: "NHL.com",
  espn: "ESPN",
  yahoo: "Yahoo",
  cbs: "CBS",
  champions: "CL Rank"
};

function localRosterKey() {
  return `champions-league:roster:${TEAM_SLUG}:2026-27`;
}

function loadLocalRoster() {
  try {
    const value = window.localStorage.getItem(localRosterKey());
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function handleHeadshotError(event) {
  const image = event.currentTarget;
  if (!image.src.endsWith(FALLBACK_HEADSHOT)) image.src = FALLBACK_HEADSHOT;
}

function numberValue(player, key) {
  return Number(player?.[key] || 0);
}

function fantasyTotal(player) {
  return Number(player?.fantasyPoints || 0).toFixed(1);
}

function compactNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  const normalized = Object.is(number, -0) ? 0 : number;
  return normalized.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function statRows(player, goalie) {
  if (goalie) {
    return [
      ["Saves", numberValue(player, "saves"), numberValue(player, "saves") * GOALIE_SCORING.saves],
      ["Goals Against", numberValue(player, "goalsAgainst"), numberValue(player, "goalsAgainst") * GOALIE_SCORING.goalsAgainst],
      ["Wins", numberValue(player, "wins"), numberValue(player, "wins") * GOALIE_SCORING.wins],
      ["Goals", numberValue(player, "goals"), numberValue(player, "goals") * GOALIE_SCORING.goals],
      ["Assists", numberValue(player, "assists"), numberValue(player, "assists") * GOALIE_SCORING.assists]
    ];
  }

  return [
    ["Goals", numberValue(player, "goals"), numberValue(player, "goals") * SCORING.goals],
    ["Assists", numberValue(player, "assists"), numberValue(player, "assists") * SCORING.assists],
    ["Hits", numberValue(player, "hits"), numberValue(player, "hits") * SCORING.hits],
    ["Shots", numberValue(player, "shots"), numberValue(player, "shots") * SCORING.shots]
  ];
}

function rankedSources(rankings) {
  return RANKING_SOURCE_ORDER
    .filter((source) => source !== "champions" && Number.isFinite(Number(rankings?.[source])))
    .map((source) => ({ source, rank: Number(rankings[source]) }));
}

function sourceDisplayName(source) {
  return RANKING_LABELS[source] || source;
}

function createPlayerSynopsis(player, goalie, rankings) {
  const publicRanks = rankedSources(rankings);
  const championRank = Number(rankings?.champions) || null;
  const total = fantasyTotal(player);
  const rows = statRows(player, goalie);
  const positiveRows = rows.filter(([, , points]) => Number(points) > 0);
  const leading = positiveRows.sort((a, b) => Number(b[2]) - Number(a[2]))[0] || null;
  const parts = [];

  if (publicRanks.length) {
    const average = publicRanks.reduce((sum, item) => sum + item.rank, 0) / publicRanks.length;
    const best = [...publicRanks].sort((a, b) => a.rank - b.rank)[0];
    const lowest = [...publicRanks].sort((a, b) => b.rank - a.rank)[0];
    if (publicRanks.length === 1) {
      parts.push(`${sourceDisplayName(best.source)} currently ranks ${player.name} No. ${best.rank}.`);
    } else if (best.source === lowest.source) {
      parts.push(`${publicRanks.length} public rankings place ${player.name} at an average of No. ${average.toFixed(1)}.`);
    } else {
      parts.push(`${publicRanks.length} public rankings average ${player.name} at No. ${average.toFixed(1)}; ${sourceDisplayName(best.source)} is highest at No. ${best.rank}, while ${sourceDisplayName(lowest.source)} has him No. ${lowest.rank}.`);
    }
  } else {
    parts.push(`${player.name} is not currently listed by the available public ranking sources.`);
  }

  if (Number(player?.gamesPlayed || 0) === 0 && Number(player?.fantasyPoints || 0) === 0) {
    parts.push(`He has no 2025–26 NHL fantasy production yet, so his preseason rankings are the more useful guide.`);
  } else {
    const rankText = championRank ? `No. ${championRank}` : "outside the current ranked pool";
    const driver = leading ? `, led by ${leading[0].toLowerCase()} worth ${compactNumber(leading[2])} FPTS` : "";
    parts.push(`Under Champions League scoring, his ${total} FPTS ranked ${rankText} based on 2025–26 results${driver}.`);
  }

  return parts.join(" ");
}

function RankingTile({ source, rank, sourceInfo, loading }) {
  const content = (
    <>
      <span>{sourceDisplayName(source)}</span>
      <strong>{loading ? "…" : rank ? `#${rank}` : "NR"}</strong>
      <small>{sourceInfo?.season || (source === "champions" ? "2025–26" : "2026–27")}</small>
    </>
  );

  if (sourceInfo?.url) {
    return <a className="run-card-rank-tile" href={sourceInfo.url} target="_blank" rel="noreferrer">{content}</a>;
  }
  return <div className="run-card-rank-tile">{content}</div>;
}

function EmptyCard({ slotNumber }) {
  return (
    <article className="locker-roster-card locker-roster-card-empty" aria-label={`Open roster spot ${slotNumber}`}>
      <strong className="locker-card-player-name">Open spot {slotNumber}</strong>
      <div className="locker-card-photo-frame locker-card-empty-photo">
        <img src={EMPTY_SLOT_SILHOUETTE} alt="" />
      </div>
      <span className="locker-card-total">—</span>
    </article>
  );
}

function PlayerCard({ player, slotNumber, onOpen }) {
  if (!player) return <EmptyCard slotNumber={slotNumber} />;

  return (
    <article className="locker-roster-card">
      <button
        className="locker-roster-card-button"
        type="button"
        onClick={onOpen}
        aria-label={`Open ${player.name} hockey card and statistics`}
      >
        <strong className="locker-card-player-name" title={player.name}>{player.name}</strong>
        <span className="locker-card-photo-frame">
          <img
            src={player.headshot || FALLBACK_HEADSHOT}
            alt={`${player.name} headshot`}
            loading="lazy"
            decoding="async"
            onError={handleHeadshotError}
          />
        </span>
        <span className="locker-card-total">{fantasyTotal(player)}</span>
      </button>
    </article>
  );
}

function RosterGroup({ title, players, type, limit, onOpen }) {
  const goalie = type === "G";
  const filled = Array.from({ length: limit }, (_, index) => players[index] || null);

  return (
    <section className={`locker-card-group locker-card-group-${type.toLowerCase()}`}>
      <h2 className="locker-card-group-title">{title}</h2>
      <div className={`locker-player-card-grid ${goalie ? "locker-goalie-card-grid" : ""}`}>
        {filled.map((player, index) => (
          <PlayerCard
            key={player ? String(player.playerId) : `${type}-open-${index}`}
            player={player}
            slotNumber={index + 1}
            onOpen={() => player && onOpen(player, goalie)}
          />
        ))}
      </div>
    </section>
  );
}

function HockeyCardOverlay({ selection, onClose, rankingData, rankingLoading }) {
  const { player, goalie } = selection;
  const rows = statRows(player, goalie);
  const rankings = rankingData?.players?.[player.name] || {};
  const synopsis = rankingLoading
    ? "Loading the latest public ranking comparison and Champions League synopsis…"
    : createPlayerSynopsis(player, goalie, rankings);
  const cardNumber = String(player.playerId || "00").slice(-3).padStart(3, "0");
  const rosterLabel = goalie ? "GOALTENDER" : player.rosterType === "D" ? "DEFENCE" : "FORWARD";

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }

    const mobileCard = window.matchMedia("(max-width: 720px)").matches;
    const previousBodyOverflow = document.body.style.overflow;
    if (mobileCard) document.body.style.overflow = "hidden";

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      if (mobileCard) document.body.style.overflow = previousBodyOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="locker-hockey-card-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <article
        className="locker-hockey-card run-for-cup-card"
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} statistics card`}
      >
        <button className="locker-hockey-card-close" type="button" onClick={onClose} aria-label="Close player card">×</button>

        <header className="run-card-topline">
          <span>CL{cardNumber}</span>
          <b>CHAMPIONS LEAGUE · CUP CHASE</b>
          <span>2025–26</span>
        </header>

        <div className="run-card-main">
          <section className="run-card-photo-side" aria-label={`${player.name} portrait`}>
            <div className="run-card-photo-ring">
              <div className="run-card-photo-window">
                <img
                  src={player.headshot || FALLBACK_HEADSHOT}
                  alt={`${player.name} headshot`}
                  onError={handleHeadshotError}
                />
              </div>
            </div>
            <span className="run-card-photo-caption">RUN FOR THE CUP</span>
          </section>

          <section className="run-card-info-side">
            <div className="run-card-player-heading">
              <div>
                <small>{player.teamAbbrev || player.team || "NHL"} · {rosterLabel}</small>
                <strong>{player.name}</strong>
              </div>
              {player.teamLogo ? (
                <img className="run-card-team-logo" src={player.teamLogo} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              ) : null}
            </div>

            <div className="run-card-rank-strip" aria-label={`${player.name} fantasy rankings`}>
              {RANKING_SOURCE_ORDER.map((source) => (
                <RankingTile
                  key={source}
                  source={source}
                  rank={rankings[source]}
                  sourceInfo={rankingData?.sources?.[source]}
                  loading={rankingLoading}
                />
              ))}
            </div>

            <p className="run-card-copy run-card-synopsis">{synopsis}</p>

            <div className="run-card-stat-table">
              <div className="run-card-stat-heading">
                <span>STAT</span><span>TOTAL</span><span>FPTS</span>
              </div>
              {rows.map(([label, raw, points]) => (
                <div className="run-card-stat-row" key={label}>
                  <b>{label}</b>
                  <em>{raw}</em>
                  <strong>{compactNumber(points)}</strong>
                </div>
              ))}
            </div>

            <div className="run-card-total-row">
              <span>TOTAL FANTASY POINTS</span>
              <strong>{fantasyTotal(player)}</strong>
            </div>
          </section>
        </div>

        <footer className="run-card-footer">
          <span>NICK&apos;S LOCKER · ROSTER EDITION</span>
          <b>{cardNumber}/2026</b>
          <span>CHAMPIONS LEAGUE FANTASY HOCKEY</span>
        </footer>
      </article>
    </div>
  );
}

export default function NickLockerRoom() {
  const [players, setPlayers] = useState([]);
  const [selection, setSelection] = useState(null);
  const [rankingData, setRankingData] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadRoster() {
      const local = loadLocalRoster();
      let roster = local?.players || [];
      if (roster.length && !cancelled) setPlayers(roster);

      try {
        const response = await fetch(`/api/rosters/${TEAM_SLUG}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(8000)
        });
        const data = await response.json();
        if (response.ok && data.roster?.players) roster = data.roster.players;
      } catch {
        // Browser roster remains the fallback.
      }

      if (cancelled) return;
      setPlayers(roster);
      if (!roster.length) return;

      try {
        const response = await fetch("/api/players?mode=leaderboard", {
          cache: "no-store",
          signal: AbortSignal.timeout(15000)
        });
        const data = await response.json();
        if (response.ok && Array.isArray(data.players)) {
          const liveById = new Map(data.players.map((player) => [String(player.playerId), player]));
          const refreshed = roster.map((saved) => ({
            ...saved,
            ...(liveById.get(String(saved.playerId)) || {})
          }));
          if (!cancelled) setPlayers(refreshed);
        }
      } catch {
        // Saved roster already includes the last successfully loaded stats and headshots.
      }
    }

    loadRoster();
    return () => { cancelled = true; };
  }, []);

  const rosterNameKey = useMemo(
    () => players.map((player) => player.name).filter(Boolean).sort().join("|"),
    [players]
  );

  useEffect(() => {
    if (!rosterNameKey) return;
    let cancelled = false;
    setRankingLoading(true);

    fetch(`/api/rankings?name=${encodeURIComponent(rosterNameKey)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(45000)
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Rankings could not be loaded.");
        if (!cancelled) setRankingData(data);
      })
      .catch((error) => {
        console.error("Ranking synopsis unavailable:", error);
      })
      .finally(() => {
        if (!cancelled) setRankingLoading(false);
      });

    return () => { cancelled = true; };
  }, [rosterNameKey]);

  const groups = useMemo(() => ({
    F: players.filter((player) => player.rosterType === "F"),
    D: players.filter((player) => player.rosterType === "D"),
    G: players.filter((player) => player.rosterType === "G")
  }), [players]);

  const teamFantasyTotal = useMemo(
    () => players.reduce((total, player) => total + Number(player?.fantasyPoints || 0), 0),
    [players]
  );

  return (
    <div className="nick-locker-viewport" aria-label="Nick's locker room">
      <div className="nick-locker-stage">
        <div className="nick-locker-roster-panel">
          <RosterGroup title="FORWARDS" players={groups.F} type="F" limit={SLOT_LIMITS.F} onOpen={(player, goalie) => setSelection({ player, goalie })} />
          <RosterGroup title="DEFENCE" players={groups.D} type="D" limit={SLOT_LIMITS.D} onOpen={(player, goalie) => setSelection({ player, goalie })} />
          <RosterGroup title="GOALIES" players={groups.G} type="G" limit={SLOT_LIMITS.G} onOpen={(player, goalie) => setSelection({ player, goalie })} />
        </div>

        <div className="nick-locker-team-total" aria-label={`Total team fantasy points ${teamFantasyTotal.toFixed(1)}`}>
          <span>TOTAL TEAM FANTASY POINTS</span>
          <strong>{teamFantasyTotal.toFixed(1)}</strong>
        </div>

        {selection ? (
          <HockeyCardOverlay
            selection={selection}
            onClose={() => setSelection(null)}
            rankingData={rankingData}
            rankingLoading={rankingLoading}
          />
        ) : null}
      </div>
    </div>
  );
}
