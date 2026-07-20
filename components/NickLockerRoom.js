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

function EmptyCard({ slotNumber }) {
  return (
    <article className="locker-roster-card locker-roster-card-empty" aria-label={`Open roster spot ${slotNumber}`}>
      <strong className="locker-card-player-name">Open spot {slotNumber}</strong>
      <div className="locker-card-photo-frame locker-card-empty-photo">
        <img src={FALLBACK_HEADSHOT} alt="" />
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

function HockeyCardOverlay({ selection, onClose }) {
  const { player, goalie } = selection;
  const rows = statRows(player, goalie);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
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
        className="locker-hockey-card"
        role="dialog"
        aria-modal="true"
        aria-label={`${player.name} statistics card`}
      >
        <button className="locker-hockey-card-close" type="button" onClick={onClose} aria-label="Close player card">×</button>

        <header className="locker-hockey-card-header">
          <small>{player.teamAbbrev || player.team || "NHL"}</small>
          <strong>{player.name}</strong>
          <span>{goalie ? "GOALTENDER" : player.rosterType === "D" ? "DEFENCE" : "FORWARD"}</span>
        </header>

        <div className="locker-hockey-card-portrait">
          <img
            src={player.headshot || FALLBACK_HEADSHOT}
            alt={`${player.name} headshot`}
            onError={handleHeadshotError}
          />
          <span className="locker-hockey-card-season">2025–26</span>
        </div>

        <div className="locker-hockey-card-stats">
          {rows.map(([label, raw, points]) => (
            <div className="locker-hockey-card-stat" key={label}>
              <b>{label}</b>
              <em>{raw}</em>
              <small>{compactNumber(points)} FPTS</small>
            </div>
          ))}
        </div>

        <footer className="locker-hockey-card-total">
          <span>TOTAL FANTASY POINTS</span>
          <strong>{fantasyTotal(player)}</strong>
        </footer>
      </article>
    </div>
  );
}

export default function NickLockerRoom() {
  const [players, setPlayers] = useState([]);
  const [selection, setSelection] = useState(null);

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
            <span>SELECT A PLAYER FOR THE FULL HOCKEY CARD</span>
          </div>

          <RosterGroup title="FORWARDS" players={groups.F} type="F" limit={SLOT_LIMITS.F} onOpen={(player, goalie) => setSelection({ player, goalie })} />
          <RosterGroup title="DEFENCE" players={groups.D} type="D" limit={SLOT_LIMITS.D} onOpen={(player, goalie) => setSelection({ player, goalie })} />
          <RosterGroup title="GOALIES" players={groups.G} type="G" limit={SLOT_LIMITS.G} onOpen={(player, goalie) => setSelection({ player, goalie })} />
        </div>

        {selection ? <HockeyCardOverlay selection={selection} onClose={() => setSelection(null)} /> : null}
      </div>
    </div>
  );
}
