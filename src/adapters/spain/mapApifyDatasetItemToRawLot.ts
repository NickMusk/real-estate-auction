import { randomUUID } from "node:crypto";

import type { AssetType, PropertySubtype, RawSpainBoeLot } from "../../domain/types.js";

interface ApifyFinancialData {
  valor_subasta?: number;
  deposito?: number;
}

interface ApifyLotData {
  nombre?: string;
  financiero?: ApifyFinancialData;
  bien?: {
    descripcion?: string;
    direccion?: string;
  };
}

interface ApifyDocument {
  titulo?: string;
  url?: string;
}

export interface ApifyDatasetItem {
  identificador?: string;
  tipo_subasta?: string;
  fecha_inicio?: string;
  fecha_conclusion?: string;
  valor_subasta?: number;
  valor_referencia_70_porciento?: number;
  deposito?: number;
  descripcion?: string;
  direccion?: string;
  localidad?: string;
  provincia?: string;
  autoridad_nombre?: string;
  detail_url?: string;
  google_maps_url?: string;
  lotes_data?: ApifyLotData[];
  documentos?: ApifyDocument[];
}

function inferAssetType(description: string): { assetType: AssetType; propertySubtype: PropertySubtype } {
  const normalized = description.toLowerCase();

  if (normalized.includes("solar") || normalized.includes("parcela")) {
    return {
      assetType: "land",
      propertySubtype: "plot"
    };
  }

  if (normalized.includes("oficina")) {
    return {
      assetType: "commercial",
      propertySubtype: "office"
    };
  }

  if (normalized.includes("nave")) {
    return {
      assetType: "commercial",
      propertySubtype: "warehouse"
    };
  }

  return {
    assetType: "residential",
    propertySubtype: "apartment"
  };
}

function buildTitle(municipality: string, assetType: AssetType, propertySubtype: PropertySubtype): string {
  if (assetType === "land") {
    return `${municipality} development land`;
  }

  if (propertySubtype === "office") {
    return `${municipality} office`;
  }

  if (propertySubtype === "warehouse") {
    return `${municipality} warehouse`;
  }

  return `${municipality} apartment`;
}

/**
 * GOAL: Translate a Spain BOE actor dataset item into the project's raw lot
 *       contract so the rest of the MVP can stay source-agnostic.
 *
 * WHY: The live Apify provider returns Spanish field names and optional nested
 *      lot structures, while the normalization pipeline expects one raw schema.
 *
 * EXPECTED FLOW:
 *   1. Read the root auction fields and the first nested lot when present.
 *   2. Infer asset type and title from the Spanish description text.
 *   3. Produce a raw lot object with stable ids and source links.
 */
export function mapApifyDatasetItemToRawLot(item: ApifyDatasetItem): RawSpainBoeLot {
  const lotData = item.lotes_data?.[0];
  const description = item.descripcion ?? lotData?.bien?.descripcion ?? "BOE property lot";
  const municipality = item.localidad ?? "Unknown municipality";
  const { assetType, propertySubtype } = inferAssetType(description);
  const assessedValue = item.valor_subasta ?? lotData?.financiero?.valor_subasta ?? 0;
  const startingPrice = item.valor_referencia_70_porciento ?? lotData?.financiero?.valor_subasta ?? assessedValue;
  const depositRequired = item.deposito ?? lotData?.financiero?.deposito ?? 0;

  return {
    id: item.identificador ?? randomUUID(),
    url: item.detail_url ?? item.google_maps_url ?? "https://subastas.boe.es",
    title: buildTitle(municipality, assetType, propertySubtype),
    assetType,
    propertySubtype,
    region: item.provincia ?? municipality,
    province: item.provincia ?? municipality,
    municipality,
    address: lotData?.bien?.direccion ?? item.direccion ?? municipality,
    coordinates: null,
    areaSqm: null,
    assessedValue,
    startingPrice,
    depositRequired,
    startDate: item.fecha_inicio ?? new Date().toISOString(),
    endDate: item.fecha_conclusion ?? new Date().toISOString(),
    status: "active",
    court: item.autoridad_nombre ?? "Unknown court",
    procedureNumber: item.identificador ?? "unknown",
    description
  };
}
