export const metadata = {
  title: "Mini Games · Champions League",
  description: "Choose a Champions League mini game."
};

export default function MiniGamesPage() {
  return (
    <section className="mini-games-hub" aria-label="Champions League Mini Games">
      <div className="mini-games-hub-shade" aria-hidden="true" />

      <nav className="mini-games-hub-nav" aria-label="Mini Games navigation">
        <a href="/">HOME</a>
      </nav>

      <header className="mini-games-hub-title">
        <span>CHAMPIONS LEAGUE</span>
        <h1>MINI GAMES</h1>
        <p>Same league. Different battles.</p>
      </header>

      <div className="mini-games-hub-options">
        <a className="mini-game-choice mini-game-choice-pickem" href="/mini-games/pick-em">
          <span className="mini-game-choice-image" aria-hidden="true">
            <img src="/pickem-logo-final.png" alt="" />
          </span>
          <span className="mini-game-choice-copy">
            <small>SEASON-LONG PREDICTION GAME</small>
            <strong>NHL PICK ’EM</strong>
            <em>Pick every matchup, track your W-L-OTL record and climb the long-table standings.</em>
            <b>ENTER PICK ’EM →</b>
          </span>
        </a>

        <a className="mini-game-choice mini-game-choice-draft" href="/mini-games/draft-challenge">
          <span className="mini-game-choice-image" aria-hidden="true">
            <span className="mini-game-ai-mark">AI</span>
            <span className="mini-game-cap">$104M</span>
          </span>
          <span className="mini-game-choice-copy">
            <small>WEEKLY ROSTER BATTLE</small>
            <strong>DRAFT CHALLENGE</strong>
            <em>Build a legal 20-player roster under the cap and try to knock the AI Dream Team off its throne.</em>
            <b>ENTER DRAFT CHALLENGE →</b>
          </span>
        </a>
      </div>

      <footer className="mini-games-hub-footer">
        <span>Pick a game. Your real Champions League roster is never affected.</span>
      </footer>
    </section>
  );
}
