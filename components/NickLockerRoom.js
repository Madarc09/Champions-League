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

function value(player, key) {
  return Number(player?.[key] || 0);
}

function fp(player) {
  return Number(player?.fantasyPoints || 0).toFixed(1);
}

function PlayerRow({ player, goalie = false, slotNumber }) {
  if (!player) {
    return (
      <div className={`locker-player-row locker-open-row ${goalie ? "goalie-row" : ""}`}>
        <div className="locker-player-identity">
          <span className="locker-open-avatar">{slotNumber}</span>
          <span className="locker-open-label">Open roster spot</span>
        </div>
        <span>—</span><span>—</span><span>—</span><span>—</span><span>—</span>
        {goalie ? <span>—</span> : null}
      </div>
    );
  }

  return (
    <div className={`locker-player-row ${goalie ? "goalie-row" : ""}`}>
      <div className="locker-player-identity">
        <img
          src={player.headshot || FALLBACK_HEADSHOT}
          alt=""
          loading="lazy"
          decoding="async"
          onError={handleHeadshotError}
        />
        <div>
          <strong>{player.name}</strong>
          <small>{player.team || "NHL"}</small>
        </div>
      </div>
      {goalie ? (
        <>
          <span>{value(player, "saves")}</span>
          <span>{value(player, "goalsAgainst")}</span>
          <span>{value(player, "wins")}</span>
          <span>{value(player, "goals")}</span>
          <span>{value(player, "assists")}</span>
          <span className="locker-fpts">{fp(player)}</span>
        </>
      ) : (
        <>
          <span>{value(player, "goals")}</span>
          <span>{value(player, "assists")}</span>
          <span>{value(player, "hits")}</span>
          <span>{value(player, "shots")}</span>
          <span className="locker-fpts">{fp(player)}</span>
        </>
      )}
    </div>
  );
}

function RosterGroup({ title, players, type, limit }) {
  const goalie = type === "G";
  const filled = Array.from({ length: limit }, (_, index) => players[index] || null);

  return (
    <section className={`locker-roster-group locker-type-${type.toLowerCase()} ${goalie ? "locker-goalie-group" : ""}`}>
      <div className={`locker-group-heading ${goalie ? "goalie-heading" : ""}`}>
        <strong>{title}</strong>
        <span>PLAYER</span>
        {goalie ? (
          <><span>SV</span><span>GA</span><span>W</span><span>G</span><span>A</span><span>FPTS</span></>
        ) : (
          <><span>G</span><span>A</span><span>H</span><span>SOG</span><span>FPTS</span></>
        )}
      </div>
      <div className="locker-group-rows">
        {filled.map((player, index) => (
          <PlayerRow
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
            <div className="locker-panel-title">
              <span>2025–26 STATS</span>
              <strong>PROJECTED LINEUP</strong>
              <small>{players.length}/20 players</small>
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
