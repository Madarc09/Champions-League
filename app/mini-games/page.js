import PickEm from "@/components/PickEm";
import { currentManager } from "@/lib/auth";

export const metadata = {
  title: "Mini Games · Champions League",
  description: "Champions League side games and challenges."
};

export const dynamic = "force-dynamic";

export default async function MiniGamesPage() {
  const manager = await currentManager();

  if (!manager) {
    return (
      <main className="mini-games-gate club-gate">
        <section>
          <span>THE CLUBHOUSE IS MEMBERS ONLY</span>
          <h1>Mini Games</h1>
          <strong>Pool managers may enter</strong>
          <p>Pick ’Em is completely optional. You only appear on its standings board after making your first pick.</p>
          <div><a href="/login?next=/mini-games">Log In</a><a href="/">Back Home</a></div>
        </section>
      </main>
    );
  }

  return (
    <main className="mini-games-page club-mini-games-page">
      <PickEm />
    </main>
  );
}
