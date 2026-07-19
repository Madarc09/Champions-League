"use client";

import { useEffect, useMemo, useState } from "react";

function money(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value));
}

function localRosterKey(team) {
  return `champions-league:roster:${team}:2026-27`;
}

function loadJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function PlayerStats({ player }) {
  if (player.rosterType === "G") {
    return (
      <div className="table-stat-line">
        <span>{player.gamesPlayed} GP</span>
        <span>{player.wins || 0} W</span>
        <span>{player.shutouts || 0} SO</span>
        <span>{player.savePct == null ? "—" : player.savePct.toFixed(3)} SV%</span>
      </div>
    );
  }

  return (
    <div className="table-stat-line">
      <span>{player.goals} G</span>
      <span>{player.assists} A</span>
      <span>{player.hits} HIT</span>
      <span>{player.shots} SOG</span>
    </div>
  );
}

function DraftTable({ players, roster, rosterLimits, salaryCap, totalCap, onDraft }) {
  const counts = roster.reduce((acc, player) => {
    acc[player.rosterType] = (acc[player.rosterType] || 0) + 1;
    return acc;
  }, { F: 0, D: 0, G: 0 });

  function disabledReason(player) {
    if (roster.some((item) => item.playerId === player.playerId)) return "Drafted";
    if (player.capHit == null) return "No salary";
    if (counts[player.rosterType] >= rosterLimits[player.rosterType]) return "Position full";
    if (totalCap + Number(player.capHit) > salaryCap) return "Over cap";
    return "";
  }

  return (
    <div className="draft-table-scroll">
      <table className="draft-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Pos</th>
            <th>2025–26 statistics</th>
            <th>Fantasy pts</th>
            <th>2026–27 cap hit</th>
            <th aria-label="Draft player" />
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const reason = disabledReason(player);
            return (
              <tr key={player.playerId}>
                <td className="draft-rank">{player.fantasyRank || "—"}</td>
                <td>
                  <div className="draft-player-name">
                    <strong>{player.name}</strong>
                    <small>{player.team} · {player.gamesPlayed} GP</small>
                  </div>
                </td>
                <td>
                  <span className={`position-chip position-${player.rosterType.toLowerCase()}`}>
                    {player.position}
                  </span>
                </td>
                <td><PlayerStats player={player} /></td>
                <td className="fantasy-points-cell">
                  {player.fantasyPoints == null ? "—" : Number(player.fantasyPoints).toFixed(1)}
                </td>
                <td className={player.capHit == null ? "missing-salary" : "salary-cell"}>
                  {player.capHit == null ? "Not loaded" : money(player.capHit)}
                </td>
                <td>
                  <button
                    className="draft-button"
                    type="button"
                    onClick={() => onDraft(player)}
                    disabled={Boolean(reason)}
                    title={reason || `Draft ${player.name}`}
                  >
                    {reason || "Draft"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LineupPlayerCard({ player, slotLabel, onRemove }) {
  return (
    <div className={`lineup-player-card ${player ? "filled" : "empty"}`}>
      <span className="lineup-slot-label">{slotLabel}</span>
      {player ? (
        <>
          <button
            className="lineup-remove"
            type="button"
            onClick={() => onRemove(player.playerId)}
            aria-label={`Remove ${player.name}`}
          >
            ×
          </button>
          <strong>{player.name}</strong>
          <small>{player.team} · {player.position}</small>
          <div className="lineup-card-bottom">
            <span>{player.fantasyPoints == null ? "Goalie" : `${Number(player.fantasyPoints).toFixed(1)} FP`}</span>
            <span>{money(player.capHit)}</span>
          </div>
        </>
      ) : (
        <span className="open-lineup-slot">Open slot</span>
      )}
    </div>
  );
}

function ForwardLine({ number, players, onRemove }) {
  const slots = [players[0] || null, players[1] || null, players[2] || null];
  return (
    <div className="lineup-row">
      <span className="line-number">Line {number}</span>
      <div className="lineup-row-cards three-up">
        <LineupPlayerCard player={slots[0]} slotLabel="LW" onRemove={onRemove} />
        <LineupPlayerCard player={slots[1]} slotLabel="C" onRemove={onRemove} />
        <LineupPlayerCard player={slots[2]} slotLabel="RW" onRemove={onRemove} />
      </div>
    </div>
  );
}

function DefencePair({ number, players, onRemove }) {
  return (
    <div className="lineup-row">
      <span className="line-number">Pair {number}</span>
      <div className="lineup-row-cards two-up">
        <LineupPlayerCard player={players[0] || null} slotLabel="LD" onRemove={onRemove} />
        <LineupPlayerCard player={players[1] || null} slotLabel="RD" onRemove={onRemove} />
      </div>
    </div>
  );
}

function LineupCard({ players, onRemove }) {
  const forwards = players.filter((player) => player.rosterType === "F");
  const defence = players.filter((player) => player.rosterType === "D");
  const goalies = players.filter((player) => player.rosterType === "G");

  return (
    <div className="panel lineup-board">
      <div className="lineup-board-header">
        <div>
          <p className="eyebrow">Daily lineup card</p>
          <h2>Projected roster</h2>
        </div>
        <span>{players.length}/20</span>
      </div>

      <section className="lineup-group">
        <h3>Forwards</h3>
        {[0, 1, 2, 3].map((line) => (
          <ForwardLine
            key={line}
            number={line + 1}
            players={forwards.slice(line * 3, line * 3 + 3)}
            onRemove={onRemove}
          />
        ))}
      </section>

      <section className="lineup-group">
        <h3>Defence</h3>
        {[0, 1, 2].map((pair) => (
          <DefencePair
            key={pair}
            number={pair + 1}
            players={defence.slice(pair * 2, pair * 2 + 2)}
            onRemove={onRemove}
          />
        ))}
      </section>

      <section className="lineup-group goalie-group">
        <h3>Goalies</h3>
        <div className="lineup-row-cards two-up">
          <LineupPlayerCard player={goalies[0] || null} slotLabel="STARTER" onRemove={onRemove} />
          <LineupPlayerCard player={goalies[1] || null} slotLabel="BACKUP" onRemove={onRemove} />
        </div>
      </section>
    </div>
  );
}

export default function RosterBuilder({ team, salaryCap, rosterLimits, scoring }) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const [poolPlayers, setPoolPlayers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loadingPool, setLoadingPool] = useState(true);
  const [poolError, setPoolError] = useState("");
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [saveStatus, setSaveStatus] = useState("Loading roster…");
  const [persistence, setPersistence] = useState("local");

  useEffect(() => {
    let cancelled = false;

    async function loadPool() {
      setLoadingPool(true);
      setPoolError("");
      try {
        const response = await fetch("/api/players?mode=leaderboard", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Player pool could not be loaded.");
        if (!cancelled) setPoolPlayers(data.players || []);
      } catch (error) {
        if (!cancelled) setPoolError(error.message || "Player pool could not be loaded.");
      } finally {
        if (!cancelled) setLoadingPool(false);
      }
    }

    loadPool();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRoster() {
      const local = loadJson(localRosterKey(team.slug), null);

      try {
        const response = await fetch(`/api/rosters/${team.slug}`, { cache: "no-store" });
        const data = await response.json();
        if (cancelled) return;

        if (data.roster?.players) {
          setPlayers(data.roster.players);
          setPersistence("shared");
          setSaveStatus(`Shared roster loaded${data.roster.updatedAt ? ` · updated ${new Date(data.roster.updatedAt).toLocaleString()}` : ""}.`);
        } else if (local?.players) {
          setPlayers(local.players);
          setPersistence("local");
          setSaveStatus("Browser roster loaded. Connect Upstash for shared saving.");
        } else {
          setPersistence(data.persistence || "local");
          setSaveStatus(data.persistence === "shared" ? "No roster saved yet." : "Browser saving is active until Upstash is connected.");
        }
      } catch {
        if (!cancelled && local?.players) setPlayers(local.players);
        if (!cancelled) setSaveStatus("Using the roster saved in this browser.");
      } finally {
        if (!cancelled) setLoadingRoster(false);
      }
    }

    loadRoster();
    return () => { cancelled = true; };
  }, [team.slug]);

  useEffect(() => {
    if (loadingRoster) return;
    window.localStorage.setItem(
      localRosterKey(team.slug),
      JSON.stringify({ team: team.slug, players, updatedAt: new Date().toISOString() })
    );
  }, [players, team.slug, loadingRoster]);

  const filteredPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return poolPlayers.filter((player) => {
      const matchesPosition = position === "ALL" || player.rosterType === position;
      const matchesQuery = !normalizedQuery
        || player.name.toLowerCase().includes(normalizedQuery)
        || String(player.team || "").toLowerCase().includes(normalizedQuery);
      return matchesPosition && matchesQuery;
    });
  }, [poolPlayers, position, query]);

  const counts = useMemo(() => players.reduce((acc, player) => {
    acc[player.rosterType] = (acc[player.rosterType] || 0) + 1;
    return acc;
  }, { F: 0, D: 0, G: 0 }), [players]);

  const totalCap = useMemo(
    () => players.reduce((sum, player) => sum + Number(player.capHit || 0), 0),
    [players]
  );
  const capRemaining = salaryCap - totalCap;
  const rosterComplete = Object.entries(rosterLimits).every(([type, limit]) => counts[type] === limit);
  const totalFantasyPoints = players.reduce((sum, player) => sum + Number(player.fantasyPoints || 0), 0);

  function addPlayer(player) {
    if (player.capHit == null) return;
    if (players.some((item) => item.playerId === player.playerId)) return;
    if (counts[player.rosterType] >= rosterLimits[player.rosterType]) return;
    if (totalCap + Number(player.capHit) > salaryCap) return;
    setPlayers((current) => [...current, player]);
    setSaveStatus(`${player.name} drafted. Save the roster when ready.`);
  }

  function removePlayer(playerId) {
    setPlayers((current) => current.filter((player) => player.playerId !== playerId));
    setSaveStatus("Roster changed. Save when ready.");
  }

  async function saveRoster() {
    setSaveStatus("Saving roster…");
    const snapshot = { team: team.slug, players, updatedAt: new Date().toISOString() };
    window.localStorage.setItem(localRosterKey(team.slug), JSON.stringify(snapshot));

    try {
      const response = await fetch(`/api/rosters/${team.slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ players })
      });
      const data = await response.json();

      if (!response.ok) {
        setPersistence("local");
        setSaveStatus(data.error || "Saved in this browser only.");
        return;
      }

      setPersistence("shared");
      setSaveStatus(`Shared roster saved · ${new Date(data.roster.updatedAt).toLocaleString()}`);
    } catch {
      setPersistence("local");
      setSaveStatus("Saved in this browser only. Shared database was unavailable.");
    }
  }

  return (
    <>
      <div className="panel cap-dashboard">
        <div className="cap-main">
          <div>
            <p className="eyebrow">Salary cap</p>
            <strong>{money(totalCap)}</strong>
            <span>of {money(salaryCap)}</span>
          </div>
          <div className={capRemaining < 0 ? "cap-remaining over" : "cap-remaining"}>
            <small>Remaining</small>
            <strong>{money(capRemaining)}</strong>
          </div>
        </div>
        <div className="cap-track" aria-label={`${Math.max(0, Math.min(100, totalCap / salaryCap * 100)).toFixed(1)} percent of cap used`}>
          <span style={{ width: `${Math.max(0, Math.min(100, totalCap / salaryCap * 100))}%` }} />
        </div>
        <div className="dashboard-stats">
          <span><strong>{players.length}/20</strong> rostered</span>
          <span><strong>{totalFantasyPoints.toFixed(1)}</strong> 2025–26 FP</span>
          <span><strong>{persistence === "shared" ? "Shared" : "Browser"}</strong> storage</span>
          <span className={rosterComplete ? "legal-status complete" : "legal-status"}>
            <strong>{rosterComplete && capRemaining >= 0 ? "Legal" : "Building"}</strong> roster status
          </span>
        </div>
        <div className="save-row">
          <p>{loadingRoster ? "Loading…" : saveStatus}</p>
          <button className="primary-button" type="button" onClick={saveRoster} disabled={loadingRoster || capRemaining < 0}>
            Save roster
          </button>
        </div>
      </div>

      <div className="builder-grid draft-builder-grid">
        <section className="panel draft-room-panel">
          <div className="draft-room-heading">
            <div>
              <p className="eyebrow">2025–26 player leaderboard</p>
              <h2>Draft room</h2>
              <p>Players are ranked by fantasy points from last season. Search by player name or NHL team, then press Draft.</p>
            </div>
            <div className="scoring-badge">
              <strong>Scoring</strong>
              <span>G {scoring.goals} · A {scoring.assists} · HIT {scoring.hits} · SOG {scoring.shots}</span>
            </div>
          </div>

          <div className="draft-controls">
            <div className="search-box draft-search-box">
              <span>⌕</span>
              <input
                id="player-search"
                type="search"
                placeholder="Search McDavid, Makar, TOR…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="filter-tabs draft-filter-tabs" role="group" aria-label="Position filter">
              {[["ALL", "All"], ["F", "Forwards"], ["D", "Defence"], ["G", "Goalies"]].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={position === value ? "active" : ""}
                  onClick={() => setPosition(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loadingPool ? <div className="empty-state">Loading the 2025–26 leaderboard…</div> : null}
          {!loadingPool && poolError ? <div className="empty-state error-state">{poolError}</div> : null}
          {!loadingPool && !poolError && filteredPlayers.length === 0 ? (
            <div className="empty-state">No players match that search.</div>
          ) : null}
          {!loadingPool && !poolError && filteredPlayers.length > 0 ? (
            <DraftTable
              players={filteredPlayers}
              roster={players}
              rosterLimits={rosterLimits}
              salaryCap={salaryCap}
              totalCap={totalCap}
              onDraft={addPlayer}
            />
          ) : null}
          <p className="salary-data-note">Cap hits are fixed in the league salary file. Players without a loaded 2026–27 cap hit cannot be drafted yet.</p>
        </section>

        <LineupCard players={players} onRemove={removePlayer} />
      </div>
    </>
  );
}
