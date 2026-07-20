"use client";

import { useEffect, useMemo, useState } from "react";
import { GOALIE_SCORING, SCORING } from "@/data/league-config";

const TEAM_SLUG = "nick";
const FALLBACK_HEADSHOT = "/player-silhouette.svg";
const SLOT_LIMITS = { F: 12, D: 6, G: 2 };

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
      ["SV", numberValue(player, "saves"), numberValue(player, "saves") * GOALIE_SCORING.saves],
      ["GA", numberValue(player, "goalsAgainst"), numberValue(player, "goalsAgainst") * GOALIE_SCORING.goalsAgainst],
      ["W", numberValue(player, "wins"), numberValue(player, "wins") * GOALIE_SCORING.wins],
      ["G", numberValue(player, "goals"), numberValue(player, "goals") * GOALIE_SCORING.goals],
      ["A", numberValue(player, "assists"), numberValue(player, "assists") * GOALIE_SCORING.assists]
    ];
  }

  return [
    ["G", numberValue(player, "goals"), numberValue(player, "goals") * SCORING.goals],
    ["A", numberValue(player, "assists"), numberValue(player, "assists") * SCORING.assists],
    ["H", numberValue(player, "hits"), numberValue(player, "hits") * SCORING.hits],
    ["SOG", numberValue(player, "shots"), numberValue(player, "shots") * SCORING.shots]
  ];
}

function EmptyCard({ slotNumber }) {
  return (
    <article className="locker-flip-card locker-flip-card-empty" aria-label={`Open roster spot ${slotNumber}`}>
      <div className="locker-card-front">
        <strong className="locker-card-player-name">Open spot {slotNumber}</strong>
        <div className="locker-card-photo-frame locker-card-empty-photo">
          <img src={FALLBACK_HEADSHOT} alt="" />
        </div>
        <span className="locker-card-total">—</span>
      </div>
    </article>
  );
}

function PlayerCard({ player, goalie = false, slotNumber, flipped, onFlip }) {
  if (!player) return <EmptyCard slotNumber={slotNumber} />;

  const rows = statRows(player, goalie);

  return (
    <article className={`locker-flip-card ${flipped ? "is-flipped" : ""}`}>
      <button
        className="locker-flip-button"
        type="button"
        onClick={onFlip}
        aria-pressed={flipped}
        aria-label={`${flipped ? "Hide" : "Show"} ${player.name} statistics`}
      >
        <span className="locker-flip-card-inner">
          <span className="locker-card-face locker-card-front">
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
          </span>

          <span className="locker-card-face locker-card-back">
            <span className="locker-card-back-heading">
              <strong>{player.name}</strong>
              <small>{player.teamAbbrev || player.team || "NHL"}</small>
            </span>
            <span className="locker-card-back-stats">
              {rows.map(([label, raw, points]) => (
                <span className="locker-card-back-stat" key={label}>
                  <b>{label}</b>
                  <em>{raw}</em>
                  <small>{compactNumber(points)} FPTS</small>
                </span>
              ))}
            </span>
            <span className="locker-card-back-total">TOTAL {fantasyTotal(player)}</span>
          </span>
        </span>
      </button>
    </article>
  );
}

function RosterGroup({ title, players, type, limit, flippedId, setFlippedId }) {
  const goalie = type === "G";
  const filled = Array.from({ length: limit }, (_, index) => players[index] || null);

  return (
    <section className={`locker-card-group locker-card-group-${type.toLowerCase()}`}>
      <h2 className="locker-card-group-title">{title}</h2>
      <div className={`locker-player-card-grid ${goalie ? "locker-goalie-card-grid" : ""}`}>
        {filled.map((player, index) => {
          const cardId = player ? String(player.playerId) : `${type}-open-${index}`;
          return (
            <PlayerCard
              key={cardId}
              player={player}
              goalie={goalie}
              slotNumber={index + 1}
              flipped={Boolean(player) && flippedId === cardId}
              onFlip={() => setFlippedId((current) => current === cardId ? null : cardId)}
            />
          );
        })}
      </div>
    </section>
  );
}

export default function NickLockerRoom() {
  const [players, setPlayers] = useState([]);
  const [flippedId, setFlippedId] = useState(null);

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

  const groups = useMemo(() => ({
    F: players.filter((player) => player.rosterType === "F"),
    D: players.filter((player) => player.rosterType === "D"),
    G: players.filter((player) => player.rosterType === "G")
  }), [players]);

  return (
    <div className="nick-locker-viewport" aria-label="Nick's locker room">
      <div className="nick-locker-stage">
        <div className="nick-locker-roster-panel">
          <div className="locker-compact-title">
            <strong>PROJECTED LINEUP</strong>
            <span>CLICK A PLAYER TO FLIP THE CARD</span>
          </div>

          <RosterGroup title="FORWARDS" players={groups.F} type="F" limit={SLOT_LIMITS.F} flippedId={flippedId} setFlippedId={setFlippedId} />
          <RosterGroup title="DEFENCE" players={groups.D} type="D" limit={SLOT_LIMITS.D} flippedId={flippedId} setFlippedId={setFlippedId} />
          <RosterGroup title="GOALIES" players={groups.G} type="G" limit={SLOT_LIMITS.G} flippedId={flippedId} setFlippedId={setFlippedId} />
        </div>
      </div>
    </div>
  );
}
