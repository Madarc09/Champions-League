"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GOALIE_SCORING, ROSTER_REVEAL_AT, SCORING } from "@/data/league-config";
import { BOT_PRESEASON_PREDICTIONS } from "@/data/generated-predictions";
import { LOCKER_BACKGROUNDS } from "@/data/locker-config";
import useLeagueStandings from "@/components/useLeagueStandings";
import { ordinal } from "@/lib/standings";
import { buildPlayerIdentityIndex, resolvePlayerFromIndex } from "@/lib/player-identity";

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
const EMPTY_PREDICTIONS = {
  teamAwards: Object.fromEntries(TEAM_PREDICTION_FIELDS.map(([key]) => [key, null])),
  playerAwards: Object.fromEntries(PLAYER_PREDICTION_FIELDS.map(([key]) => [key, null]))
};

function normalizePredictions(value) {
  return {
    teamAwards: { ...EMPTY_PREDICTIONS.teamAwards, ...(value?.teamAwards || {}) },
    playerAwards: { ...EMPTY_PREDICTIONS.playerAwards, ...(value?.playerAwards || {}) }
  };
}

function handleHeadshotError(event) {
  if (!event.currentTarget.src.endsWith(FALLBACK_HEADSHOT)) event.currentTarget.src = FALLBACK_HEADSHOT;
}

function points(player) {
  return Number(player?.fantasyPoints || 0).toFixed(1);
}

function numberValue(player, key) {
  return Number(player?.[key] || 0);
}

function compactNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return number.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function statRows(player, goalie) {
  if (goalie) {
    return [
      ["Saves", numberValue(player, "saves"), numberValue(player, "saves") * GOALIE_SCORING.saves],
      ["Goals Against", numberValue(player, "goalsAgainst"), numberValue(player, "goalsAgainst") * GOALIE_SCORING.goalsAgainst],
      ["Wins", numberValue(player, "wins"), numberValue(player, "wins") * GOALIE_SCORING.wins],
      ["Shutouts", numberValue(player, "shutouts"), numberValue(player, "shutouts") * GOALIE_SCORING.shutouts],
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

function PredictionTile({ title, selection, kind }) {
  const image = kind === "team" ? selection?.logo : selection?.headshot;
  const name = selection?.name || null;

  return (
    <article className={`prediction-tile prediction-${kind}${selection ? " selected" : " empty"}`}>
      <strong>{title}</strong>
      <div className="prediction-art">
        {image ? (
          <img
            src={image}
            alt={name ? `${name} ${kind === "team" ? "logo" : "headshot"}` : ""}
            onError={kind === "player" ? handleHeadshotError : undefined}
          />
        ) : (
          <span className="prediction-x" aria-label="No prediction submitted">×</span>
        )}
      </div>
      <small>{name || "No pick"}</small>
    </article>
  );
}

function PredictionsPanel({ side, predictions }) {
  const fields = side === "left" ? TEAM_PREDICTION_FIELDS : PLAYER_PREDICTION_FIELDS;
  const values = side === "left" ? predictions?.teamAwards : predictions?.playerAwards;
  const kind = side === "left" ? "team" : "player";

  return (
    <section className={`prediction-panel prediction-panel-${side}`} aria-label={side === "left" ? "Team predictions" : "Player award predictions"}>
      <div className="prediction-panel-title">{side === "left" ? "TEAM PICKS" : "AWARD PICKS"}</div>
      <div className={`prediction-grid prediction-grid-${kind}`}>
        {fields.map(([key, title]) => (
          <PredictionTile key={key} title={title} selection={values?.[key] || null} kind={kind} />
        ))}
      </div>
    </section>
  );
}

function PlayerSlot({ player, slotNumber, onOpen }) {
  if (!player) {
    return (
      <article className="roster-slot empty" aria-label={`Open roster spot ${slotNumber}`}>
        <div className="roster-photo empty-photo"><img src={EMPTY_SLOT_SILHOUETTE} alt="" /></div>
        <strong>Open spot {slotNumber}</strong>
        <span>—</span>
      </article>
    );
  }

  return (
    <button className="roster-slot" type="button" onClick={onOpen} aria-label={`Open ${player.name} player card`}>
      <div className="roster-photo">
        <img src={player.headshot || FALLBACK_HEADSHOT} alt={`${player.name} headshot`} onError={handleHeadshotError} />
      </div>
      <strong title={player.name}>{player.name}</strong>
      <span>{points(player)} FPTS</span>
    </button>
  );
}

function RosterGroup({ title, type, players, limit, onOpen }) {
  const slots = Array.from({ length: limit }, (_, index) => players[index] || null);
  return (
    <section className={`roster-group roster-group-${type.toLowerCase()}`}>
      <h2>{title}</h2>
      <div className="roster-grid">
        {slots.map((player, index) => (
          <PlayerSlot
            key={player ? String(player.playerId) : `${type}-${index}`}
            player={player}
            slotNumber={index + 1}
            onOpen={() => player && onOpen(player, type === "G")}
          />
        ))}
      </div>
    </section>
  );
}

function RankingTile({ source, rankings, sources, loading }) {
  const rank = rankings?.[source];
  const sourceInfo = sources?.[source];
  const content = (
    <>
      <span>{RANKING_LABELS[source]}</span>
      <strong>{loading ? "…" : rank ? `#${rank}` : "NR"}</strong>
    </>
  );

  return sourceInfo?.url ? (
    <a className="rank-tile" href={sourceInfo.url} target="_blank" rel="noreferrer">{content}</a>
  ) : (
    <div className="rank-tile">{content}</div>
  );
}

export function HockeyCardOverlay({ selection, onClose, rankingData, rankingLoading, teamName }) {
  const { player, goalie } = selection;
  const rows = statRows(player, goalie);
  const rankings = rankingData?.players?.[player.name] || {};
  const cardNumber = String(player.playerId || "00").slice(-3).padStart(3, "0");

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = prior;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const markup = (
    <div className="player-card-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <article className="player-card-modal" role="dialog" aria-modal="true" aria-label={`${player.name} statistics card`}>
        <button className="player-card-close" type="button" onClick={onClose} aria-label="Close player card">×</button>
        <header>
          <span>CL{cardNumber}</span>
          <strong>2026–27 CUP CHASE</strong>
          <span>{player.team || "NHL"}</span>
        </header>

        <div className="player-card-body">
          <section className="player-card-photo">
            <img src={player.headshot || FALLBACK_HEADSHOT} alt={`${player.name} headshot`} onError={handleHeadshotError} />
            {player.teamLogo ? <img className="player-card-team-logo" src={player.teamLogo} alt="" /> : null}
          </section>

          <section className="player-card-info">
            <p>{player.rosterType === "G" ? "GOALTENDER" : player.rosterType === "D" ? "DEFENCE" : "FORWARD"}</p>
            <h2>{player.name}</h2>

            <div className="ranking-strip">
              {RANKING_SOURCE_ORDER.map((source) => (
                <RankingTile key={source} source={source} rankings={rankings} sources={rankingData?.sources} loading={rankingLoading} />
              ))}
            </div>

            <div className="player-stat-table">
              <div><span>STAT</span><span>TOTAL</span><span>FPTS</span></div>
              {rows.map(([label, raw, fantasy]) => (
                <div key={label}><strong>{label}</strong><span>{raw}</span><b>{compactNumber(fantasy)}</b></div>
              ))}
            </div>

            <div className="player-card-total"><span>Total Fantasy Points</span><strong>{points(player)}</strong></div>
          </section>
        </div>

        <footer>{teamName.toUpperCase()} LOCKER · CHAMPIONS LEAGUE</footer>
      </article>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(markup, document.body) : null;
}

export default function LockerRoom({ team, viewerSlug = null }) {
  const viewportRef = useRef(null);
  const savedRosterRef = useRef([]);
  const teamSlug = team.slug;
  const teamName = team.name;
  const isBotTeam = team.kind === "bot";
  const isDreamTeam = team.kind === "dream";
  const lockerBackground = LOCKER_BACKGROUNDS[teamSlug] || LOCKER_BACKGROUNDS.default;

  const [players, setPlayers] = useState([]);
  const [rosterReady, setRosterReady] = useState(false);
  const [rosterConcealed, setRosterConcealed] = useState(false);
  const [predictions, setPredictions] = useState(null);
  const [selection, setSelection] = useState(null);
  const [rankingData, setRankingData] = useState(null);
  const [rankingLoading, setRankingLoading] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const centre = () => {
      if (window.matchMedia("(max-width: 760px)").matches) {
        viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      }
    };
    const frame = requestAnimationFrame(centre);
    return () => cancelAnimationFrame(frame);
  }, [teamSlug]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoster() {
      savedRosterRef.current = [];
      setPlayers([]);
      setRosterReady(false);
      setRosterConcealed(false);
      setSelection(null);

      try {
        const response = await fetch(`/api/rosters/${teamSlug}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Roster unavailable.");
        if (cancelled) return;

        if (data.concealed) {
          setRosterConcealed(true);
          setRosterReady(true);
          return;
        }

        const roster = Array.isArray(data.roster?.players) ? data.roster.players : [];
        savedRosterRef.current = roster;
        setPlayers(roster);
        setRosterConcealed(false);
        setRosterReady(true);
      } catch (error) {
        console.error("Locker roster unavailable:", error);
        if (!cancelled) setRosterReady(true);
      }
    }

    loadRoster();
    return () => { cancelled = true; };
  }, [teamSlug]);

  useEffect(() => {
    if (!rosterReady || rosterConcealed || savedRosterRef.current.length === 0) return undefined;
    let cancelled = false;

    async function refreshLivePlayers() {
      try {
        const response = await fetch("/api/players?mode=leaderboard", { cache: "no-store", signal: AbortSignal.timeout(30000) });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.players) || cancelled) return;
        const index = buildPlayerIdentityIndex(data.players);
        const refreshed = savedRosterRef.current.map((saved) => {
          const live = resolvePlayerFromIndex(saved, index);
          return live
            ? { ...saved, ...live, capHit: Number(saved.capHit ?? live.capHit ?? 0) }
            : { ...saved, fantasyPoints: 0, gamesPlayed: 0, goals: 0, assists: 0, hits: 0, shots: 0, saves: 0, goalsAgainst: 0, wins: 0, shutouts: 0 };
        });
        setPlayers(refreshed);
      } catch {}
    }

    refreshLivePlayers();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshLivePlayers();
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [rosterReady, rosterConcealed]);

  useEffect(() => {
    if (isDreamTeam) {
      setPredictions(null);
      return undefined;
    }
    if (isBotTeam) {
      setPredictions(normalizePredictions(BOT_PRESEASON_PREDICTIONS));
      return undefined;
    }

    let cancelled = false;
    fetch(`/api/predictions/${teamSlug}`, { cache: "no-store", signal: AbortSignal.timeout(20000) })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Predictions unavailable.");
        if (!cancelled) setPredictions(normalizePredictions(data.predictions));
      })
      .catch(() => {
        if (!cancelled) setPredictions(normalizePredictions(null));
      });
    return () => { cancelled = true; };
  }, [teamSlug, isBotTeam, isDreamTeam]);

  useEffect(() => {
    if (!selection?.player?.name) return undefined;
    let cancelled = false;
    setRankingLoading(true);
    setRankingData(null);
    fetch(`/api/rankings?name=${encodeURIComponent(selection.player.name)}`, { cache: "no-store", signal: AbortSignal.timeout(45000) })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error("Ranking unavailable");
        if (!cancelled) setRankingData(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRankingLoading(false);
      });
    return () => { cancelled = true; };
  }, [selection?.player?.name]);

  const groups = useMemo(() => ({
    F: players.filter((player) => player.rosterType === "F"),
    D: players.filter((player) => player.rosterType === "D"),
    G: players.filter((player) => player.rosterType === "G")
  }), [players]);

  const privateTotal = useMemo(() => players.reduce((sum, player) => sum + Number(player.fantasyPoints || 0), 0), [players]);
  const { standings, loaded: standingsLoaded } = useLeagueStandings();
  const standingIndex = standings.findIndex((entry) => entry.slug === teamSlug);
  const currentStanding = standingIndex >= 0 ? standings[standingIndex] : null;
  const higherStanding = standingIndex > 0 ? standings[standingIndex - 1] : null;
  const lowerStanding = standingIndex >= 0 && standingIndex < standings.length - 1 ? standings[standingIndex + 1] : null;
  const teamTotal = currentStanding ? Number(currentStanding.fantasyPoints || 0) : privateTotal;

  return (
    <div ref={viewportRef} className="locker-viewport" aria-label={`${teamName}'s locker room`}>
      <section className={`locker-stage locker-${teamSlug}`} style={{ backgroundImage: `url("${lockerBackground}")` }}>
        {!isDreamTeam ? (
          <>
            <PredictionsPanel side="left" predictions={predictions || EMPTY_PREDICTIONS} />
            <PredictionsPanel side="right" predictions={predictions || EMPTY_PREDICTIONS} />
          </>
        ) : null}

        {team.kind ? (
          <div className="generated-team-label">
            <strong>{teamName}</strong>
            <span>{team.description}</span>
          </div>
        ) : null}

        {!rosterConcealed ? (
          <div className="locker-roster-panel">
            <RosterGroup title="FORWARDS" type="F" players={groups.F} limit={SLOT_LIMITS.F} onOpen={(player, goalie) => setSelection({ player, goalie })} />
            <RosterGroup title="DEFENCE" type="D" players={groups.D} limit={SLOT_LIMITS.D} onOpen={(player, goalie) => setSelection({ player, goalie })} />
            <RosterGroup title="GOALIES" type="G" players={groups.G} limit={SLOT_LIMITS.G} onOpen={(player, goalie) => setSelection({ player, goalie })} />
          </div>
        ) : (
          <div className="roster-sealed">
            <strong>ROSTER SEALED</strong>
            <span>{new Date(ROSTER_REVEAL_AT).toLocaleDateString("en-CA")}</span>
          </div>
        )}

        {standingsLoaded && higherStanding ? (
          <a className="standing-neighbour left" href={`/team/${higherStanding.slug}/locker-room`}>
            <small>← {ordinal(higherStanding.rank).toUpperCase()}</small><strong>{higherStanding.name}</strong><span>{higherStanding.fantasyPoints.toFixed(1)} FPTS</span>
          </a>
        ) : null}

        <div className="locker-total">
          <span>Total Team Fantasy Points</span>
          <strong>{teamTotal.toFixed(1)}</strong>
          <small>{currentStanding ? `${ordinal(currentStanding.rank).toUpperCase()} PLACE` : rosterReady ? "LOCKED ROSTER" : "LOADING…"}</small>
        </div>

        {standingsLoaded && lowerStanding ? (
          <a className="standing-neighbour right" href={`/team/${lowerStanding.slug}/locker-room`}>
            <small>{ordinal(lowerStanding.rank).toUpperCase()} →</small><strong>{lowerStanding.name}</strong><span>{lowerStanding.fantasyPoints.toFixed(1)} FPTS</span>
          </a>
        ) : null}
      </section>

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
  );
}
