import PickEm from "@/components/PickEm";

export const metadata = {
  title: "Mini Games · Champions League",
  description: "Champions League side games and challenges."
};

export const dynamic = "force-dynamic";

export default async function MiniGamesPage() {
  return (
    <main className="mini-games-page club-mini-games-page">
      <PickEm />
    </main>
  );
}
