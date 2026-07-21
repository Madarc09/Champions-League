import { notFound } from "next/navigation";
import FuturePredictions from "@/components/FuturePredictions";
import { TEAMS } from "@/data/league-config";

export function generateStaticParams() {
  return TEAMS.map((team) => ({ team: team.slug }));
}

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

  return <FuturePredictions team={team} />;
}
