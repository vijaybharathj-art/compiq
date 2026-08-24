export interface CompanySeed {
  id: string;
  name: string;
  sectorId: string;
  archetype: "TARGET" | "BUYER" | "INVESTOR" | "LENDER" | "LAW_FIRM" | "ACCOUNTANT" | "ADVISOR_OTHER";
  isClientEntity?: boolean;
}

export const companyPool: CompanySeed[] = [
  { id: "co-grantham", name: "Grantham Industrial Partners", sectorId: "sec-industrials", archetype: "BUYER" },
  { id: "co-lockwood", name: "Lockwood Capital", sectorId: "sec-industrials", archetype: "BUYER" },
  { id: "co-faircourt-boyle", name: "Faircourt & Boyle LLP", sectorId: "sec-financials", archetype: "LAW_FIRM" },
  { id: "co-whitmore-reeves", name: "Whitmore & Reeves", sectorId: "sec-financials", archetype: "ACCOUNTANT" },
  { id: "co-sentinel-ratings", name: "Sentinel Ratings Group", sectorId: "sec-financials", archetype: "ADVISOR_OTHER" },
  { id: "co-colville", name: "Colville LLP", sectorId: "sec-financials", archetype: "LAW_FIRM" },
  { id: "co-cascade-health", name: "Cascade Health Partners", sectorId: "sec-healthcare", archetype: "BUYER" },
  { id: "co-bregman-sachs", name: "Bregman Sachs LLP", sectorId: "sec-financials", archetype: "LAW_FIRM" },
  { id: "co-northbridge-credit", name: "Northbridge Credit Partners", sectorId: "sec-financials", archetype: "LENDER" },
  { id: "co-dunmore-kessler", name: "Dunmore & Kessler LLP", sectorId: "sec-financials", archetype: "LAW_FIRM" },
  { id: "co-colvin-brothers", name: "Colvin Brothers", sectorId: "sec-financials", archetype: "ADVISOR_OTHER" },
  { id: "co-ashford-pryce", name: "Ashford Pryce LLP", sectorId: "sec-financials", archetype: "LAW_FIRM" },
  { id: "co-cliffwater-growth", name: "Cliffwater Growth Partners", sectorId: "sec-logistics", archetype: "INVESTOR" },
  { id: "co-acme-aerospace", name: "Acme Aerospace Components", sectorId: "sec-industrials", archetype: "TARGET" },
  { id: "co-meridian-clinics", name: "Meridian Specialty Clinics", sectorId: "sec-healthcare", archetype: "TARGET" },
  { id: "co-harrow-petro", name: "Harrow Petrochemicals", sectorId: "sec-materials", archetype: "BUYER" },
  { id: "co-silverline-capital", name: "Silverline Capital Partners", sectorId: "sec-financials", archetype: "INVESTOR" },
  { id: "co-meridian-bridge", name: "Meridian Bridge Lending", sectorId: "sec-financials", archetype: "LENDER" },
  { id: "co-kestrel-vane", name: "Kestrel & Vane LLP", sectorId: "sec-financials", archetype: "LAW_FIRM" },
  { id: "co-vantage-distribution", name: "Vantage Distribution Holdings", sectorId: "sec-consumer", archetype: "TARGET" },
];

export function companiesByArchetype(archetype: CompanySeed["archetype"]) {
  return companyPool.filter((c) => c.archetype === archetype);
}
