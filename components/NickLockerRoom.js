"use client";

import { useEffect, useMemo, useState } from "react";

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

function Stat({ label, value }) {
  return (
    <span className="locker-mini-stat">
      <b>{label}</b>
      <em>{value}</em>
    </span>
  );
}

function PlayerCard({ player, goalie = false, slotNumber }) {
  if (!player) {
    return (
      <article className="locker-player-card locker-player-card-empty">
        <strong className="locker-card-player-name">Open spot {slotNumber}</strong>
        <div className="locker-card-content">
          <div className="locker-card-portrait-stack">
            <div className="locker-card-empty-portrait">
              <img src={FALLBACK_HEADSHOT} alt="" />
            </div>
            <span className="locker-card-total">—</span>
          </div>
          <div className="locker-card-stats" aria-hidden="true">
            {(goalie ? ["SV", "GA", "W", "G", "A"] : ["G", "A", "H", "SOG"]).map((label) => (
              <Stat key={label} label={`${label}:`} value="—" />
            ))}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="locker-player-card">
      <strong className="locker-card-player-name" title={player.name}>{player.name}</strong>
      <div className="locker-card-content">
        <div className="locker-card-portrait-stack">
          <div className="locker-card-portrait-frame">
            <img
              src={player.headshot || FALLBACK_HEADSHOT}
              alt={`${player.name} headshot`}
              loading="lazy"
              decoding="async"
              onError={handleHeadshotError}
            />
          </div>
          <span className="locker-card-total">{fantasyTotal(player)}</span>
        </div>

        <div className="locker-card-stats">
          {goalie ? (
            <>
              <Stat label="SV:" value={numberValue(player, "saves")} />
              <Stat label="GA:" value={numberValue(player, "goalsAgainst")} />
              <Stat label="W:" value={numberValue(player, "wins")} />
              <Stat label="G:" value={numberValue(player, "goals")} />
              <Stat label="A:" value={numberValue(player, "assists")} />
            </>
          ) : (
            <>
              <Stat label="G:" value={numberValue(player, "goals")} />
              <Stat label="A:" value={numberValue(player, "assists")} />
              <Stat label="H:" value={numberValue(player, "hits")} />
              <Stat label="SOG:" value={numberValue(player, "shots")} />
            </>
          )}
        </div>
      </div>
    </article>
  );
}

function RosterGroup({ title, players, type, limit }) {
  const goalie = type === "G";
  const filled = Array.from({ length: limit }, (_, index) => players[index] || null);

  return (
    <section className={`locker-card-group locker-card-group-${type.toLowerCase()}`}>
      <div className="locker-card-group-title">
        <span>{title}</span>
      </div>
      <div className={`locker-player-card-grid ${goalie ? "locker-goalie-card-grid" : ""}`}>
        {filled.map((player, index) => (
          <PlayerCard
            key={player?.playerId || `${type}-open-${index}`}
            player={player}
            goalie={goalie}
            slotNumber={index + 1}
          />
        ))}
      </div>
    </section>
  );
}

export default function NickLockerRoom() {
  const [players, setPlayers] = useState([]);
  const [status, setStatus] = useState("Loading Nick's saved roster…");
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRoster() {
      const local = loadLocalRoster();
      let roster = local?.players || [];
      let rosterUpdatedAt = local?.updatedAt || null;
      let source = roster.length ? "browser" : "none";

      if (roster.length && !cancelled) {
        setPlayers(roster);
        setUpdatedAt(rosterUpdatedAt);
        setStatus("Showing the roster saved in this browser.");
      }

      try {
        const response = await fetch(`/api/rosters/${TEAM_SLUG}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(8000)
        });
        const data = await response.json();
        if (response.ok && data.roster?.players) {
          roster = data.roster.players;
          rosterUpdatedAt = data.roster.updatedAt || rosterUpdatedAt;
          source = "shared";
        }
      } catch {
        // Browser roster remains the fallback.
      }

      if (cancelled) return;
      setPlayers(roster);
      setUpdatedAt(rosterUpdatedAt);
      if (source === "shared") {
        setStatus("Showing Nick's shared saved roster.");
      } else if (source === "browser") {
        setStatus("Showing the roster saved in this browser.");
      } else {
        setStatus("No players have been saved yet. Add them in Nick's Draft Room.");
      }

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
    <>
      <div className="locker-room-status">
        <span>{status}</span>
        {updatedAt ? <small>Last saved {new Date(updatedAt).toLocaleString()}</small> : null}
      </div>

      <div className="nick-locker-viewport" aria-label="Nick's locker room">
        <div className="nick-locker-stage">
          <div className="nick-locker-roster-panel">
            <div className="locker-compact-title">
              <strong>PROJECTED LINEUP</strong>
              <span>2025–26 STATS</span>
            </div>

            <RosterGroup title="FORWARDS" players={groups.F} type="F" limit={SLOT_LIMITS.F} />
            <RosterGroup title="DEFENCE" players={groups.D} type="D" limit={SLOT_LIMITS.D} />
            <RosterGroup title="GOALIES" players={groups.G} type="G" limit={SLOT_LIMITS.G} />
          </div>
        </div>
      </div>
    </>
  );
}
