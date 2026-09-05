import type { Metadata } from "next";
import { RentPilotCockpit } from "@/components/rentpilot-cockpit";

export const metadata: Metadata = {
  title: "Your room search | RentPilot",
  description: "Set your area, budget and must-haves. Review web leads, checked matches and inquiry drafts.",
};

export default function CockpitPage() {
  return <RentPilotCockpit />;
}
