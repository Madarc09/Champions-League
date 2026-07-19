"use client";

import { useEffect, useMemo, useState } from "react";

const POSITION_LABELS = {
  F: "Forwards",
  D: "Defence",
  G: "Goalies"
};

function money(value) {
  if (value == null || Number.isNaN(Number(value))) return "Salary needed";
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value));
}

function safeNumber(value) {
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function localRosterKey(team) {
  return `champions-league:roster:${team}:2026-27`;
}

function localSalaryKey() {
  return "champions-league:salary-overrides:2026-27";
}

function loadJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function StatLine({ player }) {
  if (player.rosterType === "G") {
    return (
      <div className="result-stats">
        <span><strong>{player.gamesPlayed}</strong> GP</span>
        <span><strong>{player.wins || 0}</strong> W</span>
        <span><strong>{player.shutouts || 0}</strong> SO</span>
        <span><strong>{player.savePct == null ? "—" : player.savePct.toFixed(3)}</strong> SV%</span>
      </div>
    );
  }

  return (
    <div className="result-stats">
      <span><strong>{player.goals}</strong> G</span>
      <span><strong>{player.assists}</strong> A</span>
      <span><strong>{player.hits}</strong> HIT</span>
      <span><strong>{player.shots}</strong> SOG</span>
      <span className="fantasy-stat"><strong>{player.fantasyPoints}</strong> FP</span>
    </div>
  );
}

function SalaryEntry({ player, onSaved }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function saveSalary() {
    const capHit = safeNumber(value);
    if (capHit == null || capHit < 0 || capHit > 30_000_000) {
      setMessage("Enter the full cap hit, such as 12500000.");
      return;
    }

    setSaving(true);
    setMessage("");
    const payload = {
      playerId: player.playerId,
      name: player.name,
      capHit,
      source: "manual"
    };

    try {
      let adminKey = window.sessionStorage.getItem("champions-league:admin-key") || "";
      let response = await fetch("/api/salaries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(adminKey ? { "x-admin-key": adminKey } : {})
        },
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        adminKey = window.prompt("Enter the Champions League admin key to save this salary:") || "";
        if (adminKey) {
          window.sessionStorage.setItem("champions-league:admin-key", adminKey);
          response = await fetch("/api/salaries", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
            body: JSON.stringify(payload)
          });
        }
      }

      if (!response.ok) {
        const local = loadJson(localSalaryKey(), {});
        local[String(player.playerId)] = { capHit, name: player.name, source: "browser" };
        window.localStorage.setItem(localSalaryKey(), JSON.stringify(local));
        setMessage("Saved in this browser. Connect Upstash to share it with everyone.");
        onSaved(capHit, "browser");
        return;
      }

      setMessage("Salary saved.");
      onSaved(capHit, "shared");
    } catch {
      const local = loadJson(localSalaryKey(), {});
      local[String(player.playerId)] = { capHit, name: player.name, source: "browser" };
      window.localStorage.setItem(localSalaryKey(), JSON.stringify(local));
      setMessage("Saved in this browser only.");
      onSaved(capHit, "browser");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="salary-entry">
      <label htmlFor={`salary-${player.playerId}`}>2026–27 cap hit</label>
      <div className="salary-entry-row">
        <span>$</span>
        <input
          id={`salary-${player.playerId}`}
          inputMode="numeric"
          placeholder="12500000"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <button className="small-button" type="button" onClick={saveSalary} disabled={saving}>
          {saving ? "Saving…" : "Set salary"}
        </button>
      </div>
      {message ? <small>{message}</small> : null}
    </div>
  );
}

function PlayerResult({ player, onAdd, onSalarySaved, disabledReason }) {
  return (
    <article className="player-result">
      <div className="player-result-top">
        <div className={`position-chip position-${player.rosterType.toLowerCase()}`}>
          {player.position}
        </div>
        <div className="player-identity">
          <h3>{player.name}</h3>
          <p>{player.team} · {player.gamesPlayed} games</p>
        </div>
        <div className="salary-block">
          <strong>{money(player.capHit)}</strong>
          <span>{player.salarySource ? `${player.salarySource} salary` : "Verify cap hit"}</span>
        </div>
      </div>

      <StatLine player={player} />

      {player.capHit == null ? (
        <SalaryEntry
          player={player}
          onSaved={(capHit, salarySource) => onSalarySaved(player.playerId, capHit, salarySource)}
        />
      ) : (
        <div className="result-actions">
          <button
            className="primary-button compact"
            type="button"
            onClick={() => onAdd(player)}
            disabled={Boolean(disabledReason)}
          >
            {disabledReason || "Add to roster"}
          </button>
        </div>
      )}
    </article>
  );
}

function RosterSection({ type, players, limit, onRemove }) {
  const slots = Array.from({ length: limit }, (_, index) => players[index] || null);

  return (
    <section className="roster-section">
      <div className="roster-section-heading">
        <h3>{POSITION_LABELS[type]}</h3>
        <span>{players.length}/{limit}</span>
      </div>
      <div className="roster-slots">
        {slots.map((player, index) => (
          <div className={`roster-slot ${player ? "filled" : "empty"}`} key={`${type}-${index}`}>
            {player ? (
              <>
                <span className={`position-chip position-${type.toLowerCase()}`}>{player.position}</span>
                <div className="slot-player">
                  <strong>{player.name}</strong>
                  <small>{player.team} · {player.fantasyPoints == null ? "Goalie scoring TBD" : `${player.fantasyPoints} FP`}</small>
                </div>
                <strong className="slot-salary">{money(player.capHit)}</strong>
                <button className="remove-button" type="button" onClick={() => onRemove(player.playerId)} aria-label={`Remove ${player.name}`}>
                  ×
                </button>
              </>
            ) : (
              <>
                <span className="empty-number">{index + 1}</span>
                <span>Open {type} slot</span>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function RosterBuilder({ team, salaryCap, rosterLimits, scoring }) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("ALL");
  const [results, setResults] = useState([]);
  const [players, setPlayers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [saveStatus, setSaveStatus] = useState("Loading roster…");
  const [persistence, setPersistence] = useState("local");

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

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/players?search=${encodeURIComponent(query.trim())}&position=${position}`,
          { signal: controller.signal }
        );
        const data = await response.json();
        const localSalaries = loadJson(localSalaryKey(), {});
        const merged = (data.players || []).map((player) => {
          const local = localSalaries[String(player.playerId)];
          return local && player.capHit == null
            ? { ...player, capHit: Number(local.capHit), salarySource: "browser" }
            : player;
        });
        setResults(merged);
      } catch (error) {
        if (error.name !== "AbortError") setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, position]);

  const counts = useMemo(() => {
    return players.reduce((acc, player) => {
      acc[player.rosterType] = (acc[player.rosterType] || 0) + 1;
      return acc;
    }, { F: 0, D: 0, G: 0 });
  }, [players]);

  const totalCap = useMemo(
    () => players.reduce((sum, player) => sum + Number(player.capHit || 0), 0),
    [players]
  );
  const capRemaining = salaryCap - totalCap;
  const rosterComplete = Object.entries(rosterLimits).every(([type, limit]) => counts[type] === limit);
  const totalFantasyPoints = players.reduce((sum, player) => sum + Number(player.fantasyPoints || 0), 0);

  function disabledReason(player) {
    if (players.some((item) => item.playerId === player.playerId)) return "Already rostered";
    if (counts[player.rosterType] >= rosterLimits[player.rosterType]) return `${player.rosterType} slots full`;
    if (totalCap + Number(player.capHit || 0) > salaryCap) return "Over cap";
    return "";
  }

  function addPlayer(player) {
    if (disabledReason(player)) return;
    setPlayers((current) => [...current, player]);
    setSaveStatus("Roster changed. Save when ready.");
  }

  function removePlayer(playerId) {
    setPlayers((current) => current.filter((player) => player.playerId !== playerId));
    setSaveStatus("Roster changed. Save when ready.");
  }

  function updateSalary(playerId, capHit, salarySource) {
    setResults((current) => current.map((player) => (
      player.playerId === playerId ? { ...player, capHit, salarySource } : player
    )));
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
    <div className="builder-grid">
      <aside className="panel search-panel">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">Player pool</p>
            <h2>Search players</h2>
          </div>
        </div>

        <label className="search-label" htmlFor="player-search">Player or NHL team</label>
        <div className="search-box">
          <span>⌕</span>
          <input
            id="player-search"
            type="search"
            placeholder="Try McDavid, Makar, TOR…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="filter-tabs" role="group" aria-label="Position filter">
          {[
            ["ALL", "All"],
            ["F", "Forwards"],
            ["D", "Defence"],
            ["G", "Goalies"]
          ].map(([value, label]) => (
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

        <div className="scoring-note">
          <strong>Current skater scoring</strong>
          <span>G {scoring.goals} · A {scoring.assists} · HIT {scoring.hits} · SOG {scoring.shots}</span>
          <small>Goalie scoring has not been set yet, so goalie fantasy points are left blank.</small>
        </div>

        <div className="results-list" aria-live="polite">
          {searching ? <div className="empty-state">Searching NHL data…</div> : null}
          {!searching && query.trim().length < 2 ? (
            <div className="empty-state">Enter at least two letters to search the 2025–26 player pool.</div>
          ) : null}
          {!searching && query.trim().length >= 2 && results.length === 0 ? (
            <div className="empty-state">No matching players found.</div>
          ) : null}
          {!searching && results.map((player) => (
            <PlayerResult
              key={player.playerId}
              player={player}
              onAdd={addPlayer}
              onSalarySaved={updateSalary}
              disabledReason={disabledReason(player)}
            />
          ))}
        </div>
      </aside>

      <section className="roster-column">
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
            <span><strong>{totalFantasyPoints.toFixed(1)}</strong> 2025–26 skater FP</span>
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

        <div className="panel roster-board">
          <RosterSection type="F" players={players.filter((player) => player.rosterType === "F")} limit={rosterLimits.F} onRemove={removePlayer} />
          <RosterSection type="D" players={players.filter((player) => player.rosterType === "D")} limit={rosterLimits.D} onRemove={removePlayer} />
          <RosterSection type="G" players={players.filter((player) => player.rosterType === "G")} limit={rosterLimits.G} onRemove={removePlayer} />
        </div>
      </section>
    </div>
  );
}
