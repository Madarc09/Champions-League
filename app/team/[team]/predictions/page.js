import { notFound, redirect } from "next/navigation";
import { TEAMS } from "@/data/league-config";
import { currentManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PredictionsPage({ params }) {
  const { team: slug } = await params;
  const team = TEAMS.find((item) => item.slug === slug);
  if (!team) notFound();

  const manager = await currentManager();
  if (!manager) redirect(`/login?next=/team/${slug}/locker-room`);
  redirect(`/team/${manager.slug}/locker-room`);
}
