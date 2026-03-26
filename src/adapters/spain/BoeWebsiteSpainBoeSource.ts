import { load } from "cheerio";

import type { AssetType, AuctionStatus, PropertySubtype, RawSpainBoeLot } from "../../domain/types.js";
import type { SpainBoeSource } from "./SpainBoeSource.js";

interface SearchResult {
  id: string;
  detailUrl: string;
  teaser: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseEuroAmount(rawValue: string | undefined): number {
  if (!rawValue) {
    return 0;
  }

  const cleaned = rawValue
    .replace(/[€\s]/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/[^\d.-]/g, "");

  return cleaned.length > 0 ? Number.parseFloat(cleaned) : 0;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function extractIsoDate(rawValue: string | undefined): string {
  const match = rawValue?.match(/ISO:\s*([^)]+)/i);

  if (!match?.[1]) {
    throw new Error(`BOE detail page is missing an ISO date: ${rawValue ?? "empty value"}`);
  }

  return normalizeWhitespace(match[1]);
}

function parseAreaSqm(description: string): number | null {
  const match = description.match(/superficie(?:\s+construida)?\s+de\s+([\d.,']+)\s*m/i) ?? description.match(/([\d.,']+)\s*m(?:2|²|'|\b)/i);

  if (!match?.[1]) {
    return null;
  }

  const normalized = match[1].replace(/\./g, "").replace(/,/g, ".").replace(/'/g, ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferAssetType(
  assetLabel: string,
  description: string
): { assetType: AssetType; propertySubtype: PropertySubtype } {
  const normalized = `${assetLabel} ${description}`.toLowerCase();

  if (normalized.includes("solar") || normalized.includes("parcela")) {
    return {
      assetType: "land",
      propertySubtype: "plot"
    };
  }

  if (normalized.includes("oficina") || normalized.includes("local")) {
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

function deriveStatus(startDate: string, endDate: string, now: Date): AuctionStatus {
  const startAt = new Date(startDate).getTime();
  const endAt = new Date(endDate).getTime();
  const nowAt = now.getTime();

  if (nowAt < startAt) {
    return "upcoming";
  }

  if (nowAt > endAt) {
    return "completed";
  }

  return "active";
}

function tableToRecord(tableHtml: string): Record<string, string> {
  const $ = load(tableHtml);
  const tableRecord: Record<string, string> = {};

  $("tr").each((_, row) => {
    const label = normalizeWhitespace($(row).find("th").first().text());
    const value = normalizeWhitespace($(row).find("td").first().text());

    if (label.length > 0) {
      tableRecord[label] = value;
    }
  });

  return tableRecord;
}

function parseSearchResults(html: string, baseUrl: string): SearchResult[] {
  const $ = load(html);
  const results: SearchResult[] = [];
  const seenIds = new Set<string>();

  $("li.resultado-busqueda").each((_, entry) => {
    const href = $(entry).find("a[href*=\"detalleSubasta.php\"]").first().attr("href");

    if (!href) {
      return;
    }

    const url = new URL(href, baseUrl);
    const id = url.searchParams.get("idSub") ?? normalizeWhitespace($(entry).find("h3").first().text()).replace(/^SUBASTA\s+/i, "");

    if (id.length === 0 || seenIds.has(id)) {
      return;
    }

    seenIds.add(id);
    results.push({
      id,
      detailUrl: `${new URL(baseUrl).origin}/detalleSubasta.php?idSub=${id}`,
      teaser: normalizeWhitespace($(entry).find("p").last().text())
    });
  });

  return results;
}

function buildSearchBody(maxResults: number, provinceCode: string | null): URLSearchParams {
  const params = new URLSearchParams();

  params.set("campo[2]", "SUBASTA.ESTADO.CODIGO");
  params.set("dato[2]", "EJ");
  params.set("campo[3]", "BIEN.TIPO");
  params.set("dato[3]", "I");
  params.set("dato[4]", "501");

  if (provinceCode) {
    params.set("campo[8]", "BIEN.COD_PROVINCIA");
    params.set("dato[8]", provinceCode);
  }

  params.set("page_hits", maxResults > 50 ? "100" : "50");
  params.set("sort_field[0]", "SUBASTA.FECHA_FIN");
  params.set("sort_order[0]", "asc");
  params.set("accion", "Buscar");

  return params;
}

/**
 * GOAL: Pull live Spain BOE housing auctions directly from the official BOE
 *       website without depending on a third-party actor layer.
 *
 * WHY: The live scan needs a reliable first-party fallback in this environment,
 *      and the BOE website already exposes searchable listings plus structured
 *      detail pages we can normalize ourselves.
 *
 * EXPECTED FLOW:
 *   1. Submit a housing-auction search against the BOE portal.
 *   2. Discover result detail URLs and fetch the summary, authority, and goods tabs.
 *   3. Translate the scraped HTML into the shared raw lot contract.
 */
export class BoeWebsiteSpainBoeSource implements SpainBoeSource {
  readonly providerId = "boe-website-live";

  private readonly fetchFn: typeof fetch;
  private readonly maxResults: number;
  private readonly provinceCode: string | null;
  private readonly baseUrl: string;

  constructor(config?: {
    fetch?: typeof fetch;
    maxResults?: number;
    provinceCode?: string | null;
    baseUrl?: string;
  }) {
    this.fetchFn = config?.fetch ?? fetch;
    this.maxResults = Math.max(1, config?.maxResults ?? 5);
    this.provinceCode = config?.provinceCode ?? null;
    this.baseUrl = config?.baseUrl ?? "https://subastas.boe.es";
  }

  async loadLots(): Promise<RawSpainBoeLot[]> {
    const response = await this.fetchFn(`${this.baseUrl}/subastas_ava.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "User-Agent": "Mozilla/5.0 (compatible; AuctionScanner/1.0)",
        Accept: "text/html,application/xhtml+xml"
      },
      body: buildSearchBody(this.maxResults, this.provinceCode),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      throw new Error(`BOE website search failed with status ${response.status}`);
    }

    const searchHtml = await response.text();
    const searchResults = parseSearchResults(searchHtml, this.baseUrl).slice(0, this.maxResults);
    const loadedLots = await Promise.allSettled(searchResults.map(async (result) => await this.loadLot(result)));
    const successfulLots = loadedLots.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));

    if (successfulLots.length === 0) {
      throw new Error("BOE website source returned no live housing lots");
    }

    return successfulLots;
  }

  private async loadLot(searchResult: SearchResult): Promise<RawSpainBoeLot> {
    const [summaryHtml, authorityHtml, goodsHtml] = await Promise.all([
      this.fetchDetailPage(searchResult.id),
      this.fetchDetailPage(searchResult.id, 2),
      this.fetchDetailPage(searchResult.id, 3)
    ]);

    const summaryRecord = tableToRecord(summaryHtml);
    const authorityRecord = tableToRecord(authorityHtml);

    const goodsPage = load(goodsHtml);
    const lotBlock = goodsPage(".bloque").first();
    const goodsTable = lotBlock.find("table").first();
    const goodsRecord = tableToRecord(goodsPage.html(goodsTable) ?? goodsHtml);
    const assetLabel = normalizeWhitespace(lotBlock.find("h4").first().text());
    const description = goodsRecord["Descripción"] ?? searchResult.teaser;
    const municipality = goodsRecord.Localidad ?? "Unknown municipality";
    const province = goodsRecord.Provincia ?? municipality;
    const assessedValue = roundCurrency(
      Math.max(parseEuroAmount(summaryRecord.Tasación), parseEuroAmount(summaryRecord["Valor subasta"]))
    );
    const { assetType, propertySubtype } = inferAssetType(assetLabel, description);
    const startDate = extractIsoDate(summaryRecord["Fecha de inicio"]);
    const endDate = extractIsoDate(summaryRecord["Fecha de conclusión"]);

    return {
      id: searchResult.id,
      url: searchResult.detailUrl,
      title: buildTitle(municipality, assetType, propertySubtype),
      assetType,
      propertySubtype,
      region: province,
      province,
      municipality,
      address: goodsRecord.Dirección ?? municipality,
      coordinates: null,
      areaSqm: parseAreaSqm(description),
      assessedValue,
      startingPrice: roundCurrency(assessedValue * 0.7),
      depositRequired: roundCurrency(parseEuroAmount(summaryRecord["Importe del depósito"])),
      startDate,
      endDate,
      status: deriveStatus(startDate, endDate, new Date()),
      court: authorityRecord.Descripción ?? "Unknown court",
      procedureNumber: summaryRecord["Cuenta expediente"] ?? searchResult.id,
      description
    };
  }

  private async fetchDetailPage(id: string, view?: number): Promise<string> {
    const url = new URL(`${this.baseUrl}/detalleSubasta.php`);
    url.searchParams.set("idSub", id);

    if (view) {
      url.searchParams.set("ver", String(view));
    }

    const response = await this.fetchFn(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AuctionScanner/1.0)",
        Accept: "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      throw new Error(`BOE detail page ${id} failed with status ${response.status}`);
    }

    return await response.text();
  }
}
