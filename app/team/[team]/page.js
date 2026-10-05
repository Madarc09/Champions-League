import { notFound, redirect } from "next/navigation";
import { PUBLIC_TEAMS } from "@/data/league-config";

export default async function TeamPage({ params }) {
  const { team: slug } = await params;
  const team = PUBLIC_TEAMS.find((item) => item.slug === slug);
  if (!team) notFound();
  redirect(`/team/${slug}/locker-room`);
}
