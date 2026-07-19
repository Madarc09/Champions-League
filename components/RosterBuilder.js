"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function money(value) {
  if (value == null || Number.isNaN(Number(value))) return "Salary unavailable";
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

function playerMeta(player) {
  if (player.rosterType === "G") {
    return `${player.team} · ${player.gamesPlayed} GP · ${player.saves || 0} SV · ${player.goalsAgainst || 0} GA · ${player.wins || 0} W`;
  }
  return `${player.team} · ${player.gamesPlayed} GP`;
}

function DraftTable({
  players,
  roster,
  rosterLimits,
  salaryCap,
  totalCap,
  salaryLoading,
  onDraft
}) {
  const counts = roster.reduce((acc, player) => {
    acc[player.rosterType] = (acc[player.rosterType] || 0) + 1;
    return acc;
  }, { F: 0, D: 0, G: 0 });

  function disabledReason(player) {
    if (roster.some((item) => item.playerId === player.playerId)) return "Already on roster";
    if (counts[player.rosterType] >= rosterLimits[player.rosterType]) return "Position full";
    if (player.capHit != null && totalCap + Number(player.capHit) > salaryCap) return "Would exceed cap";
    return "";
  }

  return (
    <div className="draft-table-scroll">
      <table className="draft-table compact-draft-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Pos</th>
            <th>Goals</th>
            <th>Assists</th>
            <th>Hits</th>
            <th>SOG</th>
            <th>FPTS</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const reason = disabledReason(player);
            const loadingSalary = salaryLoading.has(String(player.playerId));
            const drafted = reason === "Already on roster";

            return (
              <tr key={player.playerId} className={drafted ? "drafted-row" : ""}>
                <td className="draft-rank">{player.fantasyRank || "—"}</td>
                <td className="draft-player-cell">
                  <button
                    className="draft-player-button"
                    type="button"
                    onClick={() => onDraft(player)}
                    disabled={Boolean(reason) || loadingSalary}
                    title={reason || `Draft ${player.name}`}
                  >
                    {player.name}
                  </button>
                  <span className={`draft-player-salary ${player.capHit == null ? "salary-pending" : ""}`}>
                    {loadingSalary
                      ? "Loading 2026–27 salary…"
                      : player.capHit == null
                        ? "Select name to load salary"
                        : money(player.capHit)}
                  </span>
                  <small className="draft-player-meta">{playerMeta(player)}</small>
                  {reason ? <small className="draft-player-warning">{reason}</small> : null}
                </td>
                <td>
                  <span className={`position-chip position-${player.rosterType.toLowerCase()}`}>
                    {player.position}
                  </span>
                </td>
                <td className="stat-number">{player.goals || 0}</td>
                <td className="stat-number">{player.assists || 0}</td>
                <td className="stat-number">{player.rosterType === "G" ? "—" : player.hits || 0}</td>
                <td className="stat-number">{player.rosterType === "G" ? "—" : player.shots || 0}</td>
                <td className="fantasy-points-cell">
                  {player.fantasyPoints == null ? "—" : Number(player.fantasyPoints).toFixed(1)}
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
            className="lineup-player-name-button"
            type="button"
            onClick={() => onRemove(player.playerId)}
            title={`Remove ${player.name} from the roster`}
          >
            {player.name}
          </button>
          <small>{player.team} · {player.position}</small>
          <div className="lineup-card-bottom">
            <span>{`${Number(player.fantasyPoints || 0).toFixed(1)} FP`}</span>
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
          <small>Click a player&apos;s name to remove him.</small>
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

export default function RosterBuilder({ team, salaryCap, rosterLimits, scoring, goalieScoring }) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const [poolPlayers, setPoolPlayers] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loadingPool, setLoadingPool] = useState(true);
  const [poolError, setPoolError] = useState("");
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [saveStatus, setSaveStatus] = useState("Loading roster…");
  const [persistence, setPersistence] = useState("local");
  const [salaryLoading, setSalaryLoading] = useState(new Set());
  const salaryAttempted = useRef(new Set());

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

  async function fetchSalaries(candidates, { force = false } = {}) {
    const requested = candidates.filter((player) => {
      const id = String(player.playerId);
      return player.capHit == null && (force || !salaryAttempted.current.has(id));
    }).slice(0, 20);

    if (requested.length === 0) return {};

    requested.forEach((player) => salaryAttempted.current.add(String(player.playerId)));
    setSalaryLoading((current) => {
      const next = new Set(current);
      requested.forEach((player) => next.add(String(player.playerId)));
      return next;
    });

    try {
      const response = await fetch("/api/salaries/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players: requested.map((player) => ({ playerId: player.playerId, name: player.name }))
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Salary lookup failed.");

      const records = data.records || {};
      setPoolPlayers((current) => current.map((player) => {
        const record = records[String(player.playerId)];
        return record ? { ...player, capHit: Number(record.capHit), salarySource: record.source } : player;
      }));
      return records;
    } catch (error) {
      console.error(error);
      return {};
    } finally {
      setSalaryLoading((current) => {
        const next = new Set(current);
        requested.forEach((player) => next.delete(String(player.playerId)));
        return next;
      });
    }
  }

  useEffect(() => {
    if (loadingPool || filteredPlayers.length === 0) return;
    const timer = window.setTimeout(() => {
      fetchSalaries(filteredPlayers.slice(0, 20));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [loadingPool, filteredPlayers]);

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

  async function addPlayer(selectedPlayer) {
    if (players.some((item) => item.playerId === selectedPlayer.playerId)) return;
    if (counts[selectedPlayer.rosterType] >= rosterLimits[selectedPlayer.rosterType]) {
      setSaveStatus(`The ${selectedPlayer.rosterType === "G" ? "goalie" : selectedPlayer.rosterType === "D" ? "defence" : "forward"} section is already full.`);
      return;
    }

    let player = selectedPlayer;
    if (player.capHit == null) {
      setSaveStatus(`Loading ${player.name}'s 2026–27 cap hit…`);
      const records = await fetchSalaries([player], { force: true });
      const record = records[String(player.playerId)];
      if (!record?.capHit) {
        setSaveStatus(`${player.name}'s 2026–27 cap hit could not be found. The player was not added.`);
        return;
      }
      player = { ...player, capHit: Number(record.capHit), salarySource: record.source };
    }

    if (totalCap + Number(player.capHit) > salaryCap) {
      setSaveStatus(`${player.name} would put this roster over the salary cap.`);
      return;
    }

    setPlayers((current) => [...current, player]);
    setSaveStatus(`${player.name} added. You can change the roster at any time before the deadline.`);
  }

  function removePlayer(playerId) {
    const removed = players.find((player) => player.playerId === playerId);
    setPlayers((current) => current.filter((player) => player.playerId !== playerId));
    setSaveStatus(`${removed?.name || "Player"} removed. Save the roster when you are ready.`);
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
              <p>Click a player&apos;s name to add him. Search by player name or NHL team and edit the roster whenever you need to before the deadline.</p>
            </div>
            <div className="scoring-badge scoring-badge-wide">
              <strong>Skaters</strong>
              <span>G {scoring.goals} · A {scoring.assists} · HIT {scoring.hits} · SOG {scoring.shots}</span>
              <strong>Goalies</strong>
              <span>SV {goalieScoring.saves} · GA {goalieScoring.goalsAgainst} · W {goalieScoring.wins} · G {goalieScoring.goals} · A {goalieScoring.assists}</span>
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
              salaryLoading={salaryLoading}
              onDraft={addPlayer}
            />
          ) : null}
          <p className="salary-data-note">2026–27 cap hits now come from CapSpace&apos;s public contract data. Salary appears below each player&apos;s name and is checked before the player is added.</p>
        </section>

        <LineupCard players={players} onRemove={removePlayer} />
      </div>
    </>
  );
}
