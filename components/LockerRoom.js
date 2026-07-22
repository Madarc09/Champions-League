"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GOALIE_SCORING, SCORING } from "@/data/league-config";
import { LOCKER_BACKGROUNDS } from "@/data/locker-config";
import { NHL_TEAMS_FALLBACK } from "@/data/nhl-teams";
import useLeagueStandings from "@/components/useLeagueStandings";
import { ordinal } from "@/lib/standings";

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

const TEAM_PREDICTION_FIELDS = [
  ["stanleyCup", "Stanley Cup"],
  ["presidentsTrophy", "Presidents Trophy"],
  ["westChamp", "West Champ"],
  ["eastChamp", "East Champ"]
];

const PLAYER_PREDICTION_FIELDS = [
  ["artRoss", "Art Ross"],
  ["hart", "Hart"],
  ["rocket", "Rocket"],
  ["vezina", "Vezina"],
  ["calder", "Calder"],
  ["norris", "Norris"]
];

const PLAYER_AWARD_CONFIG = {
  artRoss: { label: "Art Ross", filter: (player) => player.rosterType !== "G" },
  hart: { label: "Hart", filter: () => true },
  rocket: { label: "Rocket", filter: (player) => player.rosterType !== "G" },
  vezina: { label: "Vezina", filter: (player) => player.rosterType === "G" },
  calder: {
    label: "Calder",
    filter: (player) => Boolean(player.rookie || player.draftYear || Number(player.gamesPlayed || 0) === 0)
  },
  norris: { label: "Norris", filter: (player) => player.rosterType === "D" }
};

const TEAM_AWARD_CONFIG = {
  stanleyCup: { label: "Stanley Cup", conference: null },
  eastChamp: { label: "East Champion", conference: "East" },
  westChamp: { label: "West Champion", conference: "West" },
  presidentsTrophy: { label: "Presidents' Trophy", conference: null }
};

const EMPTY_PREDICTIONS = {
  playerAwards: Object.fromEntries(Object.keys(PLAYER_AWARD_CONFIG).map((key) => [key, null])),
  teamAwards: Object.fromEntries(Object.keys(TEAM_AWARD_CONFIG).map((key) => [key, null]))
};

function normalizedPredictions(value) {
  return {
    playerAwards: { ...EMPTY_PREDICTIONS.playerAwards, ...(value?.playerAwards || {}) },
    teamAwards: { ...EMPTY_PREDICTIONS.teamAwards, ...(value?.teamAwards || {}) },
    updatedAt: value?.updatedAt || null
  };
}

function predictionPayload(value) {
  return {
    playerAwards: { ...EMPTY_PREDICTIONS.playerAwards, ...(value?.playerAwards || {}) },
    teamAwards: { ...EMPTY_PREDICTIONS.teamAwards, ...(value?.teamAwards || {}) }
  };
}

function expectedRank(player) {
  const ranks = [player?.expectedRanks?.nhl, player?.expectedRanks?.espn]
    .map(Number)
    .filter((rank) => Number.isFinite(rank) && rank > 0);
  if (!ranks.length) return Number.POSITIVE_INFINITY;
  return ranks.reduce((total, rank) => total + rank, 0) / ranks.length;
}

function awardProduction(awardKey, player) {
  if (awardKey === "artRoss") return Number(player.goals || 0) + Number(player.assists || 0);
  if (awardKey === "rocket") return Number(player.goals || 0);
  if (awardKey === "vezina") {
    return Number(player.fantasyPoints || 0) + (Number(player.wins || 0) * 4) + (Number(player.saves || 0) * 0.05);
  }
  if (awardKey === "calder") {
    const draftBoost = Number(player.draftYear || 0) * 100 - Number(player.draftPick || 999);
    return draftBoost + Number(player.fantasyPoints || 0);
  }
  return Number(player.fantasyPoints || 0);
}

function compareExpectedCandidates(awardKey, left, right) {
  const leftRank = expectedRank(left);
  const rightRank = expectedRank(right);
  const leftHasRank = Number.isFinite(leftRank);
  const rightHasRank = Number.isFinite(rightRank);

  if (leftHasRank && rightHasRank && leftRank !== rightRank) return leftRank - rightRank;
  if (leftHasRank !== rightHasRank) return leftHasRank ? -1 : 1;

  const productionDifference = awardProduction(awardKey, right) - awardProduction(awardKey, left);
  if (productionDifference !== 0) return productionDifference;
  return String(left.name || "").localeCompare(String(right.name || ""), "en", { sensitivity: "base" });
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

function PredictionTile({ title, selection, kind, editable = false, onEdit }) {
  const image = kind === "team" ? selection?.logo : selection?.headshot;
  const name = selection?.name || null;
  const Tag = editable ? "button" : "article";

  return (
    <Tag
      className={`locker-prediction-tile locker-prediction-tile-${kind}${selection ? " is-selected" : " is-empty"}${editable ? " is-editable" : ""}`}
      type={editable ? "button" : undefined}
      onClick={editable ? onEdit : undefined}
      aria-label={editable ? `Edit ${title} prediction${name ? `, currently ${name}` : ""}` : undefined}
    >
      <strong>{title}</strong>
      <div className="locker-prediction-image">
        {image ? (
          <img
            src={image}
            alt={name ? `${name} ${kind === "team" ? "logo" : "headshot"}` : ""}
            loading="lazy"
            decoding="async"
            onError={kind === "player" ? handleHeadshotError : undefined}
          />
        ) : (
          <span aria-hidden="true">?</span>
        )}
      </div>
      <small title={name || "TBA"}>{name || "TBA"}</small>
    </Tag>
  );
}

function PredictionsPanel({ side, predictions, editable = false, onEdit }) {
  const fields = side === "left" ? TEAM_PREDICTION_FIELDS : PLAYER_PREDICTION_FIELDS;
  const values = side === "left" ? predictions?.teamAwards : predictions?.playerAwards;
  const kind = side === "left" ? "team" : "player";

  return (
    <section
      className={`locker-prediction-panel locker-prediction-panel-${side}`}
      aria-label={side === "left" ? "Team predictions" : "Player award predictions"}
    >
      {fields.map(([key, title]) => (
        <PredictionTile
          key={key}
          title={title}
          selection={values?.[key] || null}
          kind={kind}
          editable={editable}
          onEdit={() => onEdit?.({ key, title, kind })}
        />
      ))}
    </section>
  );
}

function PredictionEditorModal({ editor, players, teams, currentSelection, loading, saving, status, onSelect, onClose }) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSearch("");
  }, [editor?.key, editor?.kind]);

  useEffect(() => {
    if (!editor) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.body.classList.add("prediction-editor-open");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("prediction-editor-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editor, onClose]);

  if (!editor) return null;

  const isTeam = editor.kind === "team";
  const teamConfig = TEAM_AWARD_CONFIG[editor.key];
  const playerConfig = PLAYER_AWARD_CONFIG[editor.key];
  const normalizedSearch = search.trim().toLowerCase();

  const eligibleTeams = isTeam
    ? teams.filter((club) => !teamConfig?.conference || club.conference === teamConfig.conference)
    : [];

  const eligiblePlayers = !isTeam
    ? players.filter((player) => playerConfig?.filter?.(player))
    : [];

  const expectedPlayers = !isTeam
    ? [...eligiblePlayers].sort((left, right) => compareExpectedCandidates(editor.key, left, right)).slice(0, 25)
    : [];

  const visiblePlayers = !isTeam && normalizedSearch
    ? eligiblePlayers
        .filter((player) => `${player.name} ${player.team || ""}`.toLowerCase().includes(normalizedSearch))
        .sort((left, right) => compareExpectedCandidates(editor.key, left, right))
        .slice(0, 80)
    : expectedPlayers;

  const markup = (
    <div className="locker-prediction-editor-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="locker-prediction-editor" role="dialog" aria-modal="true" aria-label={`Edit ${editor.title} prediction`}>
        <header>
          <div>
            <p>{isTeam ? "TEAM PREDICTION" : "PLAYER PREDICTION"}</p>
            <h2>{editor.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close prediction editor">×</button>
        </header>

        {currentSelection ? (
          <div className="locker-prediction-current">
            <img
              src={isTeam ? currentSelection.logo : currentSelection.headshot || FALLBACK_HEADSHOT}
              alt=""
              onError={!isTeam ? handleHeadshotError : undefined}
            />
            <div><span>Current choice</span><strong>{currentSelection.name}</strong></div>
          </div>
        ) : null}

        <div className={`locker-prediction-editor-body ${isTeam ? "is-team-editor" : "is-player-editor"}`}>
          {isTeam ? (
            <div className="locker-prediction-team-grid">
              {eligibleTeams.map((club) => (
                <button
                  type="button"
                  key={club.abbrev}
                  className={currentSelection?.abbrev === club.abbrev ? "selected" : ""}
                  onClick={() => onSelect(club)}
                  disabled={saving}
                >
                  <img src={club.logo} alt="" />
                  <span>{club.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="locker-prediction-player-controls">
                <label className="locker-prediction-search">
                  <span>Search any eligible player</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={`Search for a ${editor.title} choice…`}
                    autoFocus
                  />
                </label>
                <div className="locker-prediction-list-heading">
                  <strong>{normalizedSearch ? "Search results" : "Top 25 expected"}</strong>
                  <span>{visiblePlayers.length} players</span>
                </div>
              </div>
              <div className="locker-prediction-player-grid">
                {visiblePlayers.map((player, index) => (
                  <button
                    type="button"
                    key={player.playerId}
                    className={String(currentSelection?.playerId) === String(player.playerId) ? "selected" : ""}
                    onClick={() => onSelect(player)}
                    disabled={saving}
                  >
                    <span className="prediction-editor-rank">{normalizedSearch ? "" : `#${index + 1}`}</span>
                    <img src={player.headshot || FALLBACK_HEADSHOT} alt="" onError={handleHeadshotError} />
                    <span className="prediction-editor-player-copy">
                      <strong>{player.name}</strong>
                      <small>{player.team || "NHL"} · {player.rosterType || player.position || "Player"}</small>
                    </span>
                  </button>
                ))}
                {!loading && !visiblePlayers.length ? <p className="prediction-editor-empty">No eligible players match that search.</p> : null}
              </div>
            </>
          )}
        </div>

        <footer>
          <span>{loading ? "Loading choices…" : saving ? "Saving to Upstash…" : status || "Select a new choice to save immediately."}</span>
          <button type="button" onClick={() => onSelect(null)} disabled={saving}>Clear prediction</button>
        </footer>
      </section>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(markup, document.body) : null;
}

function EmptyCard({ slotNumber, concealed = false }) {
  const label = concealed ? "TBA" : `Open spot ${slotNumber}`;

  return (
    <article
      className={`locker-roster-card locker-roster-card-empty${concealed ? " locker-roster-card-tba" : ""}`}
      aria-label={concealed ? `Roster selection ${slotNumber} is TBA` : `Open roster spot ${slotNumber}`}
    >
      <strong className="locker-card-player-name">{label}</strong>
      <div className="locker-card-photo-frame locker-card-empty-photo">
        <img src={EMPTY_SLOT_SILHOUETTE} alt="" />
      </div>
      <span className="locker-card-total">—</span>
    </article>
  );
}

function PlayerCard({ player, slotNumber, onOpen, concealed = false }) {
  if (!player || concealed) return <EmptyCard slotNumber={slotNumber} concealed={concealed} />;

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

function RosterGroup({ title, players, type, limit, onOpen, concealed = false }) {
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
            concealed={concealed}
          />
        ))}
      </div>
    </section>
  );
}

export function HockeyCardOverlay({ selection, onClose, rankingData, rankingLoading, teamName }) {
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

  const cardMarkup = (
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
          <span>{teamName.toUpperCase()}&apos;S LOCKER · ROSTER EDITION</span>
          <b>{cardNumber}/2026</b>
          <span>CHAMPIONS LEAGUE FANTASY HOCKEY</span>
        </footer>
      </article>
    </div>
  );

  const useMobilePortal = typeof window !== "undefined"
    && window.matchMedia("(max-width: 720px)").matches;

  return useMobilePortal ? createPortal(cardMarkup, document.body) : cardMarkup;
}

export default function LockerRoom({ team, viewerSlug = null }) {
  const teamSlug = team.slug;
  const teamName = team.name;
  const lockerBackground = LOCKER_BACKGROUNDS[teamSlug] || LOCKER_BACKGROUNDS.nick;
  const isOwnLocker = viewerSlug === teamSlug;
  const viewportRef = useRef(null);
  const [players, setPlayers] = useState([]);
  const [selection, setSelection] = useState(null);
  const [rankingData, setRankingData] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rosterReady, setRosterReady] = useState(false);
  const [predictions, setPredictions] = useState(null);
  const [predictionEditor, setPredictionEditor] = useState(null);
  const [predictionPlayers, setPredictionPlayers] = useState([]);
  const [nhlTeams, setNhlTeams] = useState(NHL_TEAMS_FALLBACK);
  const [predictionPoolLoading, setPredictionPoolLoading] = useState(false);
  const [predictionSaving, setPredictionSaving] = useState(false);
  const [predictionStatus, setPredictionStatus] = useState("");
  const predictionUpdatedAtRef = useRef(0);
  const predictionSavingRef = useRef(false);
  const predictionSaveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    function centreMobileLocker() {
      if (!window.matchMedia("(max-width: 720px)").matches) return;
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
    }

    const animationFrame = window.requestAnimationFrame(centreMobileLocker);
    window.addEventListener("resize", centreMobileLocker);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", centreMobileLocker);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSelection(null);
    setPlayers([]);
    setRosterReady(false);

    if (!isOwnLocker) {
      setRosterReady(true);
      return () => { cancelled = true; };
    }

    async function loadRoster() {
      let roster = [];

      try {
        const response = await fetch(`/api/rosters/${teamSlug}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The private roster could not be loaded.");
        roster = data.roster?.players || [];
      } catch (error) {
        console.error("Private locker roster unavailable:", error);
      }

      if (cancelled) return;
      setPlayers(roster);
      setRosterReady(true);
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
        // The private saved roster already contains its most recent stats and photos.
      }
    }

    loadRoster();
    return () => { cancelled = true; };
  }, [teamSlug, isOwnLocker, team.name]);

  useEffect(() => {
    setPredictionEditor(null);
    setPredictionStatus("");

    let cancelled = false;

    async function loadPredictions({ quiet = false } = {}) {
      if (predictionSavingRef.current) return;
      try {
        const response = await fetch(`/api/predictions/${teamSlug}?locker=${Date.now()}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Predictions could not be loaded.");
        if (cancelled) return;

        const next = normalizedPredictions(data.predictions);
        const remoteTime = Date.parse(data.predictions?.updatedAt || 0) || 0;
        if (!quiet || remoteTime > predictionUpdatedAtRef.current) {
          setPredictions(next);
          predictionUpdatedAtRef.current = remoteTime;
          if (!quiet) setPredictionStatus(
            isOwnLocker
              ? (data.predictions ? "Predictions loaded. Click any choice to edit it." : "Click any prediction tile to make a choice.")
              : (data.predictions ? `${teamName}'s predictions` : `${teamName} has not submitted predictions yet.`)
          );
        }
      } catch (error) {
        if (!cancelled && !quiet) setPredictionStatus(error.message || "Predictions could not be loaded.");
        console.error("Locker predictions unavailable:", error);
      }
    }

    loadPredictions();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadPredictions({ quiet: true });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [teamSlug, isOwnLocker, teamName]);

  useEffect(() => {
    if (!isOwnLocker) {
      setPredictionPlayers([]);
      setNhlTeams(NHL_TEAMS_FALLBACK);
      return undefined;
    }

    let cancelled = false;
    setPredictionPoolLoading(true);

    Promise.allSettled([
      fetch("/api/players?mode=predictions", { cache: "no-store" }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Player choices could not be loaded.");
        return data.players || [];
      }),
      fetch("/api/nhl-teams", { cache: "no-store" }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "NHL teams could not be loaded.");
        return data.teams || NHL_TEAMS_FALLBACK;
      })
    ]).then(([playerResult, teamResult]) => {
      if (cancelled) return;
      if (playerResult.status === "fulfilled") setPredictionPlayers(playerResult.value);
      else setPredictionStatus(playerResult.reason?.message || "Player choices could not be loaded.");
      if (teamResult.status === "fulfilled" && teamResult.value.length) setNhlTeams(teamResult.value);
      setPredictionPoolLoading(false);
    });

    return () => { cancelled = true; };
  }, [isOwnLocker]);

  function selectPrediction(value) {
    if (!predictionEditor || !isOwnLocker) return;

    const base = normalizedPredictions(predictions);
    const next = predictionEditor.kind === "team"
      ? { ...base, teamAwards: { ...base.teamAwards, [predictionEditor.key]: value } }
      : { ...base, playerAwards: { ...base.playerAwards, [predictionEditor.key]: value } };

    setPredictions(next);
    setPredictionEditor(null);
    setPredictionSaving(true);
    predictionSavingRef.current = true;
    setPredictionStatus("Saving prediction to Upstash…");

    predictionSaveQueueRef.current = predictionSaveQueueRef.current.catch(() => undefined).then(async () => {
      try {
        const response = await fetch(`/api/predictions/${teamSlug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(predictionPayload(next))
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The prediction could not be saved.");

        const saved = normalizedPredictions(data.predictions);
        setPredictions(saved);
        predictionUpdatedAtRef.current = Date.parse(data.predictions?.updatedAt || 0) || Date.now();
        setPredictionStatus(`Saved automatically · ${new Date(data.predictions.updatedAt).toLocaleTimeString()}`);
      } catch (error) {
        setPredictionStatus(error.message || "Automatic save failed.");
      } finally {
        predictionSavingRef.current = false;
        setPredictionSaving(false);
      }
    });
  }

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

  const privateTeamFantasyTotal = useMemo(
    () => players.reduce((total, player) => total + Number(player?.fantasyPoints || 0), 0),
    [players]
  );

  const { standings, loaded: standingsLoaded } = useLeagueStandings({
    currentTeamSlug: teamSlug,
    currentPlayers: players,
    currentRosterReady: isOwnLocker && rosterReady
  });
  const standingIndex = standings.findIndex((entry) => entry.slug === teamSlug);
  const currentStanding = standingIndex >= 0 ? standings[standingIndex] : null;
  const higherStanding = standingIndex > 0 ? standings[standingIndex - 1] : null;
  const lowerStanding = standingIndex >= 0 && standingIndex < standings.length - 1
    ? standings[standingIndex + 1]
    : null;
  const teamFantasyTotal = isOwnLocker && rosterReady
    ? privateTeamFantasyTotal
    : Number(currentStanding?.fantasyPoints || 0);

  return (
    <div ref={viewportRef} className="nick-locker-viewport" aria-label={`${teamName}'s locker room`}>
      <div className={`nick-locker-stage locker-team-${teamSlug}`} style={{ backgroundImage: `url("${lockerBackground}")` }}>
        <>
          <PredictionsPanel
            side="left"
            predictions={predictions}
            editable={isOwnLocker}
            onEdit={setPredictionEditor}
          />
          <PredictionsPanel
            side="right"
            predictions={predictions}
            editable={isOwnLocker}
            onEdit={setPredictionEditor}
          />
        </>

        <div className="nick-locker-roster-panel">
          <RosterGroup title="FORWARDS" players={groups.F} type="F" limit={SLOT_LIMITS.F} onOpen={(player, goalie) => setSelection({ player, goalie })} concealed={!isOwnLocker} />
          <RosterGroup title="DEFENCE" players={groups.D} type="D" limit={SLOT_LIMITS.D} onOpen={(player, goalie) => setSelection({ player, goalie })} concealed={!isOwnLocker} />
          <RosterGroup title="GOALIES" players={groups.G} type="G" limit={SLOT_LIMITS.G} onOpen={(player, goalie) => setSelection({ player, goalie })} concealed={!isOwnLocker} />
        </div>

        {standingsLoaded && higherStanding ? (
          <a
            className="locker-standing-link locker-standing-link-left"
            href={`/team/${higherStanding.slug}/locker-room`}
            aria-label={`Open ${higherStanding.name}'s ${ordinal(higherStanding.rank)} place locker room`}
          >
            <small>← {ordinal(higherStanding.rank).toUpperCase()} PLACE</small>
            <strong>{higherStanding.name}</strong>
            <span>{higherStanding.fantasyPoints.toFixed(1)} FPTS</span>
          </a>
        ) : null}

        <div className="nick-locker-team-total" aria-label={`Total team fantasy points ${teamFantasyTotal.toFixed(1)}${currentStanding ? `, ${ordinal(currentStanding.rank)} place` : ""}`}>
          <span>TOTAL TEAM FANTASY POINTS</span>
          <strong>{teamFantasyTotal.toFixed(1)}</strong>
          <em>{standingsLoaded && currentStanding ? `${ordinal(currentStanding.rank).toUpperCase()} PLACE` : "RANKING…"}</em>
        </div>

        {standingsLoaded && lowerStanding ? (
          <a
            className="locker-standing-link locker-standing-link-right"
            href={`/team/${lowerStanding.slug}/locker-room`}
            aria-label={`Open ${lowerStanding.name}'s ${ordinal(lowerStanding.rank)} place locker room`}
          >
            <small>{ordinal(lowerStanding.rank).toUpperCase()} PLACE →</small>
            <strong>{lowerStanding.name}</strong>
            <span>{lowerStanding.fantasyPoints.toFixed(1)} FPTS</span>
          </a>
        ) : null}

        {selection ? (
          <HockeyCardOverlay
            selection={selection}
            onClose={() => setSelection(null)}
            rankingData={rankingData}
            rankingLoading={rankingLoading}
            teamName={teamName}
          />
        ) : null}
      </div>

      <PredictionEditorModal
        editor={predictionEditor}
        players={predictionPlayers}
        teams={nhlTeams}
        currentSelection={predictionEditor
          ? predictionEditor.kind === "team"
            ? predictions?.teamAwards?.[predictionEditor.key] || null
            : predictions?.playerAwards?.[predictionEditor.key] || null
          : null}
        loading={predictionPoolLoading}
        saving={predictionSaving}
        status={predictionStatus}
        onSelect={selectPrediction}
        onClose={() => setPredictionEditor(null)}
      />
    </div>
  );
}
