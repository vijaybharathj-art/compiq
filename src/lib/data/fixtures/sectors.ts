import type { Sector } from "@/types/domain";

export const sectors: Sector[] = [
  { id: "sec-industrials", name: "Industrials" },
  { id: "sec-healthcare", name: "Healthcare" },
  { id: "sec-consumer", name: "Consumer & Retail" },
  { id: "sec-energy", name: "Energy & Renewables" },
  { id: "sec-logistics", name: "Transportation & Logistics" },
  { id: "sec-technology", name: "Technology" },
  { id: "sec-materials", name: "Materials" },
  { id: "sec-financials", name: "Financial Institutions" },
];

export function getSector(id: string) {
  return sectors.find((s) => s.id === id);
}
