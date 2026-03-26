import type { NormalizedLot, RawSpainBoeLot } from "../../domain/types.js";

function calculateDiscountPct(assessedValue: number, startingPrice: number): number {
  return Math.round((((assessedValue - startingPrice) / assessedValue) * 100 + Number.EPSILON) * 100) / 100;
}

function calculatePricePerSqm(startingPrice: number, areaSqm: number | null): number | null {
  if (!areaSqm) {
    return null;
  }

  return Math.round(startingPrice / areaSqm);
}

function calculateDaysUntilAuction(now: Date, endDate: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / millisecondsPerDay));
}

export function normalizeBoeLot(rawLot: RawSpainBoeLot, now: Date): NormalizedLot {
  const endDate = new Date(rawLot.endDate);

  return {
    id: `ES-BOE-${rawLot.id}`,
    sourceId: rawLot.id,
    country: "ES",
    source: "subastas.boe.es",
    sourceUrl: rawLot.url,
    title: rawLot.title,
    assetType: rawLot.assetType,
    propertySubtype: rawLot.propertySubtype,
    location: {
      region: rawLot.region,
      province: rawLot.province,
      municipality: rawLot.municipality,
      address: rawLot.address,
      coordinates: rawLot.coordinates
        ? {
            lat: rawLot.coordinates.lat,
            lng: rawLot.coordinates.lng
          }
        : null
    },
    areaSqm: rawLot.areaSqm,
    pricing: {
      assessedValue: rawLot.assessedValue,
      startingPrice: rawLot.startingPrice,
      depositRequired: rawLot.depositRequired,
      currency: "EUR"
    },
    auction: {
      startDate: rawLot.startDate,
      endDate: rawLot.endDate,
      status: rawLot.status,
      court: rawLot.court,
      procedureNumber: rawLot.procedureNumber
    },
    computed: {
      discountPct: calculateDiscountPct(rawLot.assessedValue, rawLot.startingPrice),
      pricePerSqm: calculatePricePerSqm(rawLot.startingPrice, rawLot.areaSqm),
      daysUntilAuction: calculateDaysUntilAuction(now, endDate)
    },
    rawDescription: rawLot.description
  };
}
