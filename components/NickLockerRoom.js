"use client";

import LockerRoom from "@/components/LockerRoom";
import { TEAMS } from "@/data/league-config";

const nick = TEAMS.find((team) => team.slug === "nick");

export default function NickLockerRoom() {
  return <LockerRoom team={nick} />;
}
