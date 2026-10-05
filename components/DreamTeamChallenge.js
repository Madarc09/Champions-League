"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const LIMITS = { F: 12, D: 6, G: 2 };
const SALARY_CAP = 104_000_000;

function formatPoints(value) {
  return Number(value || 0).toLocaleString("en-CA", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatMoney(value, digits = 1) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "—";
  return `$${(number / 1_000_000).toFixed(digits)}M`;
}

function shortName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "Player";
  return parts.at(-1);
}

function positionLabel(type) {
  return type === "D" ? "DEFENCE" : type === "G" ? "GOALIES" : "FORWARDS";
}

function ChallengeRosterStrip({ title, entry, accent = false }) {
  const players = Array.isArray(entry?.players) ? entry.players : [];
  const groups = ["F", "D", "G"].map((type) => ({ type, players: players.filter((player) => player.rosterType === type) }));

  return (
    <section className={`challenge-roster-showcase${accent ? " is-crown" : ""}`}>
      <header>
        <div>
          <span>{title}</span>
          <strong>{entry?.type === "ai" ? "AI WEEKLY TEAM" : `${entry?.managerName || "Manager"} · ATTEMPT ${entry?.attemptNumber || "—"}`}</strong>
        </div>
        <div className="challenge-roster-score">
          <b>{formatPoints(entry?.fantasyPoints)}</b>
          <small>FPTS</small>
        </div>
      </header>
      <div className="challenge-showcase-meta">
        <span>{formatMoney(entry?.totalCap)} / $104M</span>
        {entry?.type === "manager" ? <span>{accent ? "CURRENT CROWN" : "CHALLENGER"}</span> : <span>WEEKLY AI TARGET</span>}
      </div>
      <div className="challenge-mini-roster">
        {groups.map((group) => (
          <div className={`challenge-mini-group challenge-mini-${group.type.toLowerCase()}`} key={group.type}>
            <em>{positionLabel(group.type)}</em>
            <div>
              {group.players.map((player) => (
                <span className="challenge-mini-player" key={player.playerId} title={`${player.name} · ${formatPoints(player.fantasyPoints)} FPTS`}>
                  <img src={player.headshot || "/player-silhouette.svg"} alt="" />
                  <b>{shortName(player.name)}</b>
                  <small>{formatPoints(player.fantasyPoints)}</small>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SelectedGroup({ type, players, onRemove }) {
  const limit = LIMITS[type];
  const slots = Array.from({ length: limit }, (_, index) => players[index] || null);
  return (
    <section className={`challenge-selected-group selected-${type.toLowerCase()}`}>
      <header>
        <strong>{positionLabel(type)}</strong>
        <span>{players.length}/{limit}</span>
      </header>
      <div className="challenge-selected-slots">
        {slots.map((player, index) => player ? (
          <button type="button" key={player.playerId} onClick={() => onRemove(player.playerId)} title={`Remove ${player.name}`}>
            <img src={player.headshot || "/player-silhouette.svg"} alt="" />
            <span>{shortName(player.name)}</span>
            <small>{formatPoints(player.fantasyPoints)}</small>
          </button>
        ) : (
          <span className="challenge-empty-slot" key={`${type}-${index}`}>{type}</span>
        ))}
      </div>
    </section>
  );
}

function Leaderboard({ entries, aiScore, champion, onView }) {
  return (
    <section className="challenge-leaderboard panel-metal">
      <header>
        <div>
          <span>LIVE RANKING</span>
          <h2>Challenge Board</h2>
        </div>
        <small>{entries.length} ATTEMPT{entries.length === 1 ? "" : "S"}</small>
      </header>
      <div className="challenge-leaderboard-head">
        <span>#</span><span>MANAGER</span><span>ATTEMPT</span><span>FPTS</span><span>VS AI</span>
      </div>
      <div className="challenge-leaderboard-list">
        {entries.length ? entries.map((entry, index) => (
          <button type="button" key={entry.id} className={entry.isChampion ? "is-holder" : ""} onClick={() => onView(entry.id)}>
            <b>{index + 1}</b>
            <strong>{entry.managerName}</strong>
            <span>#{entry.attemptNumber}</span>
            <span>{formatPoints(entry.fantasyPoints)}</span>
            <em className={Number(entry.gapToAI || 0) > 0 ? "positive" : Number(entry.gapToAI || 0) < 0 ? "negative" : ""}>
              {Number(entry.gapToAI || 0) > 0 ? "+" : ""}{formatPoints(entry.gapToAI)}
            </em>
          </button>
        )) : (
          <div className="challenge-no-entries">
            <strong>No human attempts yet.</strong>
            <span>The AI opens the week at {formatPoints(aiScore)} FPTS.</span>
          </div>
        )}
      </div>
      <footer>
        <span>Crown holder: <b>{champion?.type === "ai" ? "AI" : champion?.managerName || "AI"}</b></span>
        <span>Ties do not take the crown.</span>
      </footer>
    </section>
  );
}

export default function DreamTeamChallenge() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadChallenge = useCallback(async () => {
    const response = await fetch("/api/dream-team-challenge", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The Dream Team Challenge could not be loaded.");
    setSnapshot(data);
    return data;
  }, []);

  const loadPlayers = useCallback(async () => {
    const response = await fetch("/api/dream-team-challenge/players", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The player pool could not be loaded.");
    setPlayers(data.players || []);
    return data.players || [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadChallenge(), loadPlayers()])
      .catch((error) => { if (!cancelled) setStatus(error.message || "The challenge could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadChallenge, loadPlayers]);

  useEffect(() => {
    function refreshVisible() {
      if (document.visibilityState !== "visible") return;
      Promise.allSettled([loadChallenge(), loadPlayers()]);
    }
    const interval = window.setInterval(refreshVisible, 60_000);
    window.addEventListener("focus", refreshVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
    };
  }, [loadChallenge, loadPlayers]);

  const byId = useMemo(() => new Map(players.map((player) => [String(player.playerId), player])), [players]);
  const selectedPlayers = useMemo(() => selectedIds.map((id) => byId.get(String(id))).filter(Boolean), [selectedIds, byId]);
  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);
  const groups = useMemo(() => ({
    F: selectedPlayers.filter((player) => player.rosterType === "F"),
    D: selectedPlayers.filter((player) => player.rosterType === "D"),
    G: selectedPlayers.filter((player) => player.rosterType === "G")
  }), [selectedPlayers]);
  const totalCap = useMemo(() => selectedPlayers.reduce((sum, player) => sum + Number(player.capHit || 0), 0), [selectedPlayers]);
  const currentPoints = useMemo(() => selectedPlayers.reduce((sum, player) => sum + Number(player.fantasyPoints || 0), 0), [selectedPlayers]);
  const aiScore = Number(snapshot?.ai?.fantasyPoints || 0);
  const currentGap = currentPoints - aiScore;
  const rosterComplete = selectedPlayers.length === 20 && groups.F.length === 12 && groups.D.length === 6 && groups.G.length === 2 && totalCap <= SALARY_CAP;

  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    return players
      .filter((player) => position === "ALL" || player.rosterType === position)
      .filter((player) => !query || player.name.toLowerCase().includes(query) || String(player.team || "").toLowerCase().includes(query))
      .slice(0, query ? 180 : 120);
  }, [players, position, search]);

  function addPlayer(player) {
    if (!player || selectedSet.has(String(player.playerId))) return;
    const type = player.rosterType;
    if (!LIMITS[type] || groups[type].length >= LIMITS[type]) {
      setStatus(`${positionLabel(type)} is already full.`);
      return;
    }
    if (totalCap + Number(player.capHit || 0) > SALARY_CAP) {
      setStatus(`${player.name} would put this attempt over the $104M cap.`);
      return;
    }
    setSelectedIds((current) => [...current, player.playerId]);
    setStatus("");
  }

  function removePlayer(playerId) {
    setSelectedIds((current) => current.filter((id) => String(id) !== String(playerId)));
    setStatus("");
  }

  function clearRoster() {
    setSelectedIds([]);
    setStatus("");
  }

  async function submitRoster() {
    if (!snapshot?.manager) {
      router.push("/login?next=/dream-team-challenge");
      return;
    }
    if (!rosterComplete) {
      setStatus("Finish a legal 12F / 6D / 2G roster under $104M before submitting.");
      return;
    }

    setSubmitting(true);
    setStatus("Submitting challenge roster…");
    try {
      const response = await fetch("/api/dream-team-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerIds: selectedPlayers.map((player) => player.playerId) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The challenge roster could not be submitted.");
      await loadChallenge();
      const won = data.submitted?.isChampion || data.champion?.id === data.submitted?.id;
      setStatus(won
        ? `CROWN TAKEN — attempt #${data.submitted?.attemptNumber} is now the Dream Team.`
        : `Attempt #${data.submitted?.attemptNumber} submitted at ${formatPoints(data.submitted?.fantasyPoints)} FPTS.`);
    } catch (error) {
      setStatus(error.message || "The challenge roster could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  async function viewEntry(entryId) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await fetch(`/api/dream-team-challenge?entry=${encodeURIComponent(entryId)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That challenge roster could not be loaded.");
      setDetail(data.entry || null);
    } catch (error) {
      setStatus(error.message || "That challenge roster could not be loaded.");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="challenge-page">
      <section className="challenge-hero">
        <span className="challenge-kicker">WEEKLY MINI GAME · {snapshot?.weekKey || "2026–27"}</span>
        <h1>Dream Team <b>Challenge</b></h1>
        <p>Build a completely separate $104M roster and try to knock the AI off the Dream Team throne. Submit as many attempts as you want; your real Champions League roster is never touched.</p>
        <div className="challenge-rule-pills">
          <span>12 F</span><span>6 D</span><span>2 G</span><span>$104M CAP</span><span>UNLIMITED TRIES</span><span>LIVE FPTS</span>
        </div>
      </section>

      {snapshot ? (
        <section className="challenge-crown-grid">
          <ChallengeRosterStrip title="CURRENT CROWN" entry={snapshot.champion} accent />
          <ChallengeRosterStrip title="AI TARGET" entry={snapshot.ai} />
        </section>
      ) : null}

      <section className="challenge-workspace">
        <div className="challenge-builder panel-metal">
          <header className="challenge-builder-header">
            <div>
              <span>BUILD AN ATTEMPT</span>
              <h2>{snapshot?.manager ? `${snapshot.manager.name}'s Challenge Roster` : "Challenge Roster"}</h2>
            </div>
            <button type="button" className="challenge-clear" onClick={clearRoster} disabled={!selectedPlayers.length}>CLEAR</button>
          </header>

          <div className="challenge-meter-grid">
            <div><span>Players</span><strong>{selectedPlayers.length}/20</strong></div>
            <div className={totalCap > SALARY_CAP ? "is-danger" : ""}><span>Cap</span><strong>{formatMoney(totalCap)}</strong><small>{formatMoney(SALARY_CAP - totalCap)} left</small></div>
            <div><span>Your FPTS</span><strong>{formatPoints(currentPoints)}</strong></div>
            <div className={currentGap > 0 ? "is-winning" : currentGap < 0 ? "is-danger" : ""}><span>vs AI</span><strong>{currentGap > 0 ? "+" : ""}{formatPoints(currentGap)}</strong><small>AI {formatPoints(aiScore)}</small></div>
          </div>

          <div className="challenge-selected-roster">
            <SelectedGroup type="F" players={groups.F} onRemove={removePlayer} />
            <SelectedGroup type="D" players={groups.D} onRemove={removePlayer} />
            <SelectedGroup type="G" players={groups.G} onRemove={removePlayer} />
          </div>

          <div className="challenge-submit-row">
            <div>
              <strong>{rosterComplete ? "Roster legal and ready." : "Build exactly 12F / 6D / 2G under the cap."}</strong>
              <span>{snapshot?.manager ? "Submitting creates a new mini-game attempt only." : "Sign in as a pool manager to submit."}</span>
            </div>
            <button type="button" onClick={submitRoster} disabled={submitting || (Boolean(snapshot?.manager) && !rosterComplete)}>
              {submitting ? "SUBMITTING…" : snapshot?.manager ? "CHALLENGE THE AI" : "LOG IN TO CHALLENGE"}
            </button>
          </div>
          {status ? <p className="challenge-status">{status}</p> : null}
        </div>

        <Leaderboard entries={snapshot?.leaderboard || []} aiScore={aiScore} champion={snapshot?.champion} onView={viewEntry} />
      </section>

      <section className="challenge-player-pool panel-metal">
        <header>
          <div>
            <span>LIVE NHL POOL</span>
            <h2>Draft Board</h2>
          </div>
          <div className="challenge-player-search">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search player or team…" />
            <div className="challenge-position-tabs">
              {["ALL", "F", "D", "G"].map((type) => (
                <button type="button" key={type} className={position === type ? "active" : ""} onClick={() => setPosition(type)}>{type}</button>
              ))}
            </div>
          </div>
        </header>

        <div className="challenge-player-table-head">
          <span>PLAYER</span><span>POS</span><span>CAP</span><span>FPTS</span><span />
        </div>
        <div className="challenge-player-list">
          {loading ? <p className="challenge-loading">Loading the live player pool…</p> : candidates.map((player) => {
            const selected = selectedSet.has(String(player.playerId));
            const positionFull = groups[player.rosterType]?.length >= LIMITS[player.rosterType];
            const overCap = !selected && totalCap + Number(player.capHit || 0) > SALARY_CAP;
            return (
              <article key={player.playerId} className={selected ? "is-selected" : ""}>
                <div className="challenge-pool-player">
                  <img src={player.headshot || "/player-silhouette.svg"} alt="" />
                  <div><strong>{player.name}</strong><small>{player.team}</small></div>
                </div>
                <b>{player.rosterType}</b>
                <span>{formatMoney(player.capHit, 2)}</span>
                <strong>{formatPoints(player.fantasyPoints)}</strong>
                <button type="button" onClick={() => selected ? removePlayer(player.playerId) : addPlayer(player)} disabled={!selected && (positionFull || overCap)}>
                  {selected ? "REMOVE" : "ADD"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      {(detail || detailLoading) ? (
        <div className="challenge-detail-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setDetail(null); }}>
          <section className="challenge-detail-modal">
            <button type="button" className="challenge-detail-close" onClick={() => setDetail(null)}>×</button>
            {detailLoading ? <p>Loading challenge roster…</p> : detail ? <ChallengeRosterStrip title="CHALLENGE ENTRY" entry={detail} accent={detail.isChampion} /> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
