import {
  DEFAULT_STANDINGS,
  LEAGUE_NAME,
  ROSTER_LIMITS,
  SALARY_CAP,
  SCORING,
  SEASON_LABEL
} from "@/data/league-config";

function money(value) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Winners only · {SEASON_LABEL}</p>
          <h1>{LEAGUE_NAME}</h1>
          <p className="hero-text">
            Eight champions. Shared player pool. One hard salary cap. Every manager
            can build the best 20-player roster they can fit under {money(SALARY_CAP)}.
          </p>
          <div className="hero-pills">
            <span>{ROSTER_LIMITS.F} forwards</span>
            <span>{ROSTER_LIMITS.D} defence</span>
            <span>{ROSTER_LIMITS.G} goalies</span>
          </div>
        </div>
        <div className="trophy-card" aria-hidden="true">
          <div className="trophy-cup">★</div>
          <div className="trophy-stem" />
          <div className="trophy-base" />
          <strong>CHAMPIONS</strong>
          <span>LEAGUE</span>
        </div>
      </section>

      <section className="panel standings-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">League table</p>
            <h2>Standings</h2>
          </div>
          <p>Select a manager to open and edit that team&apos;s roster.</p>
        </div>

        <div className="table-wrap">
          <table className="standings-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Team</th>
                <th>GP</th>
                <th>W</th>
                <th>L</th>
                <th>OTL</th>
                <th>PTS</th>
              </tr>
            </thead>
            <tbody>
              {DEFAULT_STANDINGS.map((team, index) => (
                <tr key={team.slug}>
                  <td><span className="rank-badge">{index + 1}</span></td>
                  <td>
                    <a className="team-link" href={`/team/${team.slug}`}>
                      <span className="team-avatar">{team.name.slice(0, 1)}</span>
                      <span>
                        <strong>{team.name}</strong>
                        <small>Open roster →</small>
                      </span>
                    </a>
                  </td>
                  <td>{team.gp}</td>
                  <td>{team.w}</td>
                  <td>{team.l}</td>
                  <td>{team.otl}</td>
                  <td><strong>{team.pts}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rules-grid">
        <article className="panel rule-card">
          <p className="eyebrow">Roster rule</p>
          <h3>Players are not exclusive</h3>
          <p>
            Joe and Nick can both roster the same NHL player. Only duplicate players
            within one manager&apos;s own roster are blocked.
          </p>
        </article>
        <article className="panel rule-card">
          <p className="eyebrow">Current scoring</p>
          <h3>Easy to change later</h3>
          <p>
            Goals {SCORING.goals}, assists {SCORING.assists}, hits {SCORING.hits},
            and shots {SCORING.shots}. All weights live in one config file.
          </p>
        </article>
        <article className="panel rule-card">
          <p className="eyebrow">Data season</p>
          <h3>2025–26 player results</h3>
          <p>
            Search results calculate fantasy points from the completed 2025–26 regular
            season while cap hits use the 2026–27 season.
          </p>
        </article>
      </section>
    </>
  );
}
