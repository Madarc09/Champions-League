import { notFound, redirect } from "next/navigation";
import FuturePredictions from "@/components/FuturePredictions";
import { TEAMS } from "@/data/league-config";
import { currentManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { team: slug } = await params;
  const team = TEAMS.find((item) => item.slug === slug);
  if (!team) return {};

  return {
    title: `${team.name}'s Predictions | Champions League`,
    description: `${team.name}'s Champions League NHL award and team predictions.`
  };
}

export default async function PredictionsPage({ params }) {
  const { team: slug } = await params;
  const team = TEAMS.find((item) => item.slug === slug);
  if (!team) notFound();

  const manager = await currentManager();
  if (!manager) redirect(`/login?next=/team/${slug}/predictions`);
  if (manager.slug !== slug) redirect(`/team/${manager.slug}/predictions`);

  return (
    <div className="prediction-page-root">
      <FuturePredictions team={team} />
    </div>
  );
}
