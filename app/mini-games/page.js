import PickEm from "@/components/PickEm";
import { currentManager } from "@/lib/auth";

export const metadata = {
  title: "Mini Games · Champions League",
  description: "Champions League side games and challenges."
};

export const dynamic = "force-dynamic";

export default async function MiniGamesPage() {
  const manager = await currentManager();
  const nickAccess = manager?.slug === "nick";

  if (!nickAccess) {
    return (
      <main className="mini-games-gate">
        <section>
          <span>CHAMPIONS LEAGUE LAB</span>
          <h1>Mini Games</h1>
          <strong>Nick-only testing for now</strong>
          <p>{manager ? `You're signed in as ${manager.name}.` : "Sign in as Nick to test the Mini Games section."}</p>
          <div>
            <a href="/login?next=/mini-games">{manager ? "Switch Login" : "Log In"}</a>
            <a href="/">Back Home</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mini-games-page">
      <header className="mini-games-hero">
        <div>
          <span>CHAMPIONS LEAGUE LAB</span>
          <h1>Mini Games</h1>
          <p>Side challenges that never touch the real drafted rosters or league standings.</p>
        </div>
        <a href="/">← Home</a>
      </header>

      <section className="mini-game-launchers" aria-label="Mini game selection">
        <a className="mini-game-launch-card" href="/dream-team-challenge">
          <span>WEEKLY</span>
          <strong>Dream Team Challenge</strong>
          <p>Build a $104M roster and try to knock the AI out of the Dream Team crown.</p>
          <b>OPEN CHALLENGE →</b>
        </a>
        <div className="mini-game-launch-card is-current">
          <span>WEEKLY</span>
          <strong>NHL Pick ’Em</strong>
          <p>Pick the entire NHL week in advance. Each game stays editable until its own puck drop.</p>
          <b>PLAYING NOW</b>
        </div>
      </section>

      <PickEm />
    </main>
  );
}
