import type { Banker } from "@/types/domain";

export const bankers: Banker[] = [
  {
    id: "banker-bharath",
    name: "Bharath Vijay",
    initials: "BV",
    title: "Managing Director, Head of Coverage",
    team: "MA",
    email: "bharath.vijay@tattava-demo.bank",
  },
  {
    id: "banker-schen",
    name: "Sarah Chen",
    initials: "SC",
    title: "Director, M&A",
    team: "MA",
    email: "sarah.chen@tattava-demo.bank",
  },
  {
    id: "banker-jwhitfield",
    name: "James Whitfield",
    initials: "JW",
    title: "Vice President, DCM",
    team: "DCM",
    email: "james.whitfield@tattava-demo.bank",
  },
  {
    id: "banker-panand",
    name: "Priya Anand",
    initials: "PA",
    title: "Director, ECM",
    team: "ECM",
    email: "priya.anand@tattava-demo.bank",
  },
  {
    id: "banker-mwebb",
    name: "Marcus Webb",
    initials: "MW",
    title: "Director, Restructuring",
    team: "RESTRUCTURING",
    email: "marcus.webb@tattava-demo.bank",
  },
  {
    id: "banker-etorres",
    name: "Elena Torres",
    initials: "ET",
    title: "Vice President, Private Capital",
    team: "PRIVATE_CAPITAL",
    email: "elena.torres@tattava-demo.bank",
  },
  {
    id: "banker-danil",
    name: "Daniel Ilyin",
    initials: "DI",
    title: "Associate, M&A",
    team: "MA",
    email: "daniel.ilyin@tattava-demo.bank",
  },
];

export const CURRENT_USER_ID = "banker-bharath";

export function getBanker(id: string) {
  return bankers.find((b) => b.id === id);
}
