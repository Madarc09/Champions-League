import PickEm from "@/components/PickEm";

export const metadata = {
  title: "NHL Pick ’Em · Champions League",
  description: "Champions League NHL Pick ’Em."
};

export const dynamic = "force-dynamic";

export default function PickEmPage() {
  return (
    <main className="mini-games-page club-mini-games-page">
      <PickEm />
    </main>
  );
}
