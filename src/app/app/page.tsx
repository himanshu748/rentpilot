import type { Metadata } from "next";
import { RentPilotCockpit } from "@/components/rentpilot-cockpit";

export const metadata: Metadata = {
  title: "Pursuit cockpit | RentPilot",
  description: "Rank, explain and act on every room you are chasing.",
};

export default function CockpitPage() {
  return <RentPilotCockpit />;
}
