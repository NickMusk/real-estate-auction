export type AuctionLotSource = "subastas.boe.es";
export type AssetType = "residential" | "commercial" | "land";
export type PropertySubtype = "apartment" | "office" | "warehouse" | "plot";
export type AuctionStatus = "upcoming" | "active" | "completed" | "failed" | "rescheduled";
export type ScanRunStatus = "running" | "completed" | "failed";
export type AggregationTrigger = "manual" | "scheduled";
export type SchedulerOutcome = "completed" | "failed" | null;
export type DeliveryStatus = "previewed" | "delivered" | "failed";

export interface Location {
  region: string;
  province: string;
  municipality: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  } | null;
}

export interface Pricing {
  assessedValue: number;
  startingPrice: number;
  depositRequired: number;
  currency: "EUR";
}

export interface AuctionWindow {
  startDate: string;
  endDate: string;
  status: AuctionStatus;
  court: string;
  procedureNumber: string;
}

export interface ComputedMetrics {
  discountPct: number;
  pricePerSqm: number | null;
  daysUntilAuction: number;
}

export interface NormalizedLot {
  id: string;
  sourceId: string;
  country: "ES";
  source: AuctionLotSource;
  sourceUrl: string;
  title: string;
  assetType: AssetType;
  propertySubtype: PropertySubtype;
  location: Location;
  areaSqm: number | null;
  pricing: Pricing;
  auction: AuctionWindow;
  computed: ComputedMetrics;
  rawDescription: string;
}

export interface RawSpainBoeLot {
  id: string;
  url: string;
  title: string;
  assetType: AssetType;
  propertySubtype: PropertySubtype;
  region: string;
  province: string;
  municipality: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  } | null;
  areaSqm: number | null;
  assessedValue: number;
  startingPrice: number;
  depositRequired: number;
  startDate: string;
  endDate: string;
  status: AuctionStatus;
  court: string;
  procedureNumber: string;
  description: string;
}

export interface RawListingRecord {
  source: AuctionLotSource;
  sourceId: string;
  payload: RawSpainBoeLot;
  sourceHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ScanRunRecord {
  id: number;
  source: AuctionLotSource;
  status: ScanRunStatus;
  startedAt: string;
  finishedAt: string | null;
  importedCount: number;
  updatedCount: number;
  errorMessage: string | null;
}

export interface ScanResult {
  id: number;
  status: Exclude<ScanRunStatus, "running">;
  importedCount: number;
  updatedCount: number;
}

export interface BestDealInsight {
  lotId: string;
  title: string;
  sourceUrl: string;
  score: number;
  verdict: string;
  summary: string;
  reasons: string[];
}

export interface AnalysisSnapshotRecord {
  id: number;
  source: AuctionLotSource;
  model: string;
  createdAt: string;
  scanRunId: number;
  analyzedLotIds: string[];
  summary: string;
  topDeals: BestDealInsight[];
}

export interface AnalysisDraft {
  model: string;
  summary: string;
  topDeals: BestDealInsight[];
}

export interface AggregationResult {
  status: "completed";
  trigger: AggregationTrigger;
  scan: ScanResult;
  analysis: AnalysisSnapshotRecord;
  delivery: DeliveryRunRecord;
  shortlistedCount: number;
}

export interface SchedulerState {
  enabled: boolean;
  intervalMinutes: number;
  isRunning: boolean;
  nextRunAt: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastOutcome: SchedulerOutcome;
  totalRuns: number;
  skippedRuns: number;
}

export interface AggregationPrefilter {
  minDiscountPct: number;
  allowedStatuses: AuctionStatus[];
  maxAnalyzedLots: number;
}

export interface DeliveryRunRecord {
  id: number;
  analysisSnapshotId: number;
  providerId: string;
  status: DeliveryStatus;
  createdAt: string;
  previewText: string;
  externalId: string | null;
  errorMessage: string | null;
}

export interface RuntimeProviderState {
  source: string;
  analyzer: string;
  delivery: string;
}
