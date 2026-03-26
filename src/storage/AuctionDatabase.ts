import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AnalysisSnapshotRecord,
  BestDealInsight,
  DeliveryRunRecord,
  DeliveryStatus,
  NormalizedLot,
  RawListingRecord,
  RawSpainBoeLot,
  ScanRunRecord,
  ScanRunStatus
} from "../domain/types.js";

interface UpsertResult {
  inserted: boolean;
  updated: boolean;
}

interface RawListingRow {
  source: string;
  source_id: string;
  payload_json: string;
  source_hash: string;
  first_seen_at: string;
  last_seen_at: string;
}

interface LotRow {
  id: string;
  source_id: string;
  country: string;
  source: string;
  source_url: string;
  title: string;
  asset_type: string;
  property_subtype: string;
  location_json: string;
  area_sqm: number | null;
  pricing_json: string;
  auction_json: string;
  computed_json: string;
  raw_description: string;
  last_source_hash: string;
  first_seen_at: string;
  last_seen_at: string;
}

interface ScanRunRow {
  id: number;
  source: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  imported_count: number;
  updated_count: number;
  error_message: string | null;
}

interface AnalysisSnapshotRow {
  id: number;
  source: string;
  model: string;
  scan_run_id: number;
  created_at: string;
  summary: string;
  top_deals_json: string;
  analyzed_lot_ids_json: string;
}

interface DeliveryRunRow {
  id: number;
  analysis_snapshot_id: number;
  provider_id: string;
  status: string;
  created_at: string;
  preview_text: string;
  external_id: string | null;
  error_message: string | null;
}

interface TableInfoRow {
  name: string;
}

export class AuctionDatabase {
  private readonly sqlite: DatabaseSync;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      mkdirSync(dirname(databasePath), { recursive: true });
    }

    this.sqlite = new DatabaseSync(databasePath);
    this.initialize();
  }

  private initialize(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS scan_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        imported_count INTEGER NOT NULL DEFAULT 0,
        updated_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS raw_listings (
        source TEXT NOT NULL,
        source_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        PRIMARY KEY (source, source_id)
      );

      CREATE TABLE IF NOT EXISTS lots (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        country TEXT NOT NULL,
        source TEXT NOT NULL,
        source_url TEXT NOT NULL,
        title TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        property_subtype TEXT NOT NULL,
        location_json TEXT NOT NULL,
        area_sqm REAL,
        pricing_json TEXT NOT NULL,
        auction_json TEXT NOT NULL,
        computed_json TEXT NOT NULL,
        raw_description TEXT NOT NULL,
        last_source_hash TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS analysis_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        model TEXT NOT NULL,
        scan_run_id INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        summary TEXT NOT NULL,
        top_deals_json TEXT NOT NULL,
        analyzed_lot_ids_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS delivery_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        analysis_snapshot_id INTEGER NOT NULL,
        provider_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        preview_text TEXT NOT NULL,
        external_id TEXT,
        error_message TEXT
      );
    `);

    this.ensureColumn("analysis_snapshots", "scan_run_id", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("analysis_snapshots", "analyzed_lot_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const rows = this.sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as unknown as TableInfoRow[];
    if (rows.some((row) => row.name === columnName)) {
      return;
    }

    this.sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  beginScanRun(source: string, startedAt: string): number {
    const result = this.sqlite
      .prepare(`
        INSERT INTO scan_runs (source, status, started_at)
        VALUES (?, 'running', ?)
      `)
      .run(source, startedAt);

    return Number(result.lastInsertRowid);
  }

  finishScanRun(params: {
    id: number;
    status: ScanRunStatus;
    finishedAt: string;
    importedCount: number;
    updatedCount: number;
    errorMessage?: string;
  }): void {
    this.sqlite
      .prepare(`
        UPDATE scan_runs
        SET status = ?,
            finished_at = ?,
            imported_count = ?,
            updated_count = ?,
            error_message = ?
        WHERE id = ?
      `)
      .run(
        params.status,
        params.finishedAt,
        params.importedCount,
        params.updatedCount,
        params.errorMessage ?? null,
        params.id
      );
  }

  upsertRawListing(params: {
    source: string;
    sourceId: string;
    payload: RawSpainBoeLot;
    sourceHash: string;
    seenAt: string;
  }): UpsertResult {
    const existing = this.sqlite
      .prepare(`
        SELECT source, source_id, payload_json, source_hash, first_seen_at, last_seen_at
        FROM raw_listings
        WHERE source = ? AND source_id = ?
      `)
      .get(params.source, params.sourceId) as RawListingRow | undefined;

    if (!existing) {
      this.sqlite
        .prepare(`
          INSERT INTO raw_listings (source, source_id, payload_json, source_hash, first_seen_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(params.source, params.sourceId, JSON.stringify(params.payload), params.sourceHash, params.seenAt, params.seenAt);

      return { inserted: true, updated: false };
    }

    this.sqlite
      .prepare(`
        UPDATE raw_listings
        SET payload_json = ?,
            source_hash = ?,
            last_seen_at = ?
        WHERE source = ? AND source_id = ?
      `)
      .run(JSON.stringify(params.payload), params.sourceHash, params.seenAt, params.source, params.sourceId);

    return { inserted: false, updated: true };
  }

  upsertLot(params: { lot: NormalizedLot; sourceHash: string; seenAt: string }): UpsertResult {
    const existing = this.sqlite
      .prepare(`
        SELECT id
        FROM lots
        WHERE id = ?
      `)
      .get(params.lot.id) as { id: string } | undefined;

    if (!existing) {
      this.sqlite
        .prepare(`
          INSERT INTO lots (
            id, source_id, country, source, source_url, title, asset_type, property_subtype,
            location_json, area_sqm, pricing_json, auction_json, computed_json, raw_description,
            last_source_hash, first_seen_at, last_seen_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          params.lot.id,
          params.lot.sourceId,
          params.lot.country,
          params.lot.source,
          params.lot.sourceUrl,
          params.lot.title,
          params.lot.assetType,
          params.lot.propertySubtype,
          JSON.stringify(params.lot.location),
          params.lot.areaSqm,
          JSON.stringify(params.lot.pricing),
          JSON.stringify(params.lot.auction),
          JSON.stringify(params.lot.computed),
          params.lot.rawDescription,
          params.sourceHash,
          params.seenAt,
          params.seenAt
        );

      return { inserted: true, updated: false };
    }

    this.sqlite
      .prepare(`
        UPDATE lots
        SET source_url = ?,
            title = ?,
            asset_type = ?,
            property_subtype = ?,
            location_json = ?,
            area_sqm = ?,
            pricing_json = ?,
            auction_json = ?,
            computed_json = ?,
            raw_description = ?,
            last_source_hash = ?,
            last_seen_at = ?
        WHERE id = ?
      `)
      .run(
        params.lot.sourceUrl,
        params.lot.title,
        params.lot.assetType,
        params.lot.propertySubtype,
        JSON.stringify(params.lot.location),
        params.lot.areaSqm,
        JSON.stringify(params.lot.pricing),
        JSON.stringify(params.lot.auction),
        JSON.stringify(params.lot.computed),
        params.lot.rawDescription,
        params.sourceHash,
        params.seenAt,
        params.lot.id
      );

    return { inserted: false, updated: true };
  }

  listLots(): NormalizedLot[] {
    const rows = this.sqlite
      .prepare(`
        SELECT id, source_id, country, source, source_url, title, asset_type, property_subtype,
               location_json, area_sqm, pricing_json, auction_json, computed_json, raw_description,
               last_source_hash, first_seen_at, last_seen_at
        FROM lots
        ORDER BY source_id ASC
      `)
      .all() as unknown as LotRow[];

    return rows.map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      country: row.country as "ES",
      source: row.source as "subastas.boe.es",
      sourceUrl: row.source_url,
      title: row.title,
      assetType: row.asset_type as NormalizedLot["assetType"],
      propertySubtype: row.property_subtype as NormalizedLot["propertySubtype"],
      location: JSON.parse(row.location_json) as NormalizedLot["location"],
      areaSqm: row.area_sqm,
      pricing: JSON.parse(row.pricing_json) as NormalizedLot["pricing"],
      auction: JSON.parse(row.auction_json) as NormalizedLot["auction"],
      computed: JSON.parse(row.computed_json) as NormalizedLot["computed"],
      rawDescription: row.raw_description
    }));
  }

  listRawListings(): RawListingRecord[] {
    const rows = this.sqlite
      .prepare(`
        SELECT source, source_id, payload_json, source_hash, first_seen_at, last_seen_at
        FROM raw_listings
        ORDER BY source_id ASC
      `)
      .all() as unknown as RawListingRow[];

    return rows.map((row) => ({
      source: row.source as RawListingRecord["source"],
      sourceId: row.source_id,
      payload: JSON.parse(row.payload_json) as RawSpainBoeLot,
      sourceHash: row.source_hash,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at
    }));
  }

  listScanRuns(): ScanRunRecord[] {
    const rows = this.sqlite
      .prepare(`
        SELECT id, source, status, started_at, finished_at, imported_count, updated_count, error_message
        FROM scan_runs
        ORDER BY id ASC
      `)
      .all() as unknown as ScanRunRow[];

    return rows.map((row) => ({
      id: row.id,
      source: row.source as ScanRunRecord["source"],
      status: row.status as ScanRunRecord["status"],
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      importedCount: row.imported_count,
      updatedCount: row.updated_count,
      errorMessage: row.error_message
    }));
  }

  insertAnalysisSnapshot(params: {
    source: string;
    model: string;
    createdAt: string;
    summary: string;
    scanRunId: number;
    analyzedLotIds: string[];
    topDeals: BestDealInsight[];
  }): AnalysisSnapshotRecord {
    const result = this.sqlite
      .prepare(`
        INSERT INTO analysis_snapshots (
          source, model, scan_run_id, created_at, summary, top_deals_json, analyzed_lot_ids_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        params.source,
        params.model,
        params.scanRunId,
        params.createdAt,
        params.summary,
        JSON.stringify(params.topDeals),
        JSON.stringify(params.analyzedLotIds)
      );

    return {
      id: Number(result.lastInsertRowid),
      source: params.source as AnalysisSnapshotRecord["source"],
      model: params.model,
      createdAt: params.createdAt,
      scanRunId: params.scanRunId,
      analyzedLotIds: params.analyzedLotIds,
      summary: params.summary,
      topDeals: params.topDeals
    };
  }

  listAnalysisSnapshots(): AnalysisSnapshotRecord[] {
    const rows = this.sqlite
      .prepare(`
        SELECT id, source, model, scan_run_id, created_at, summary, top_deals_json, analyzed_lot_ids_json
        FROM analysis_snapshots
        ORDER BY id ASC
      `)
      .all() as unknown as AnalysisSnapshotRow[];

    return rows.map((row) => ({
      id: row.id,
      source: row.source as AnalysisSnapshotRecord["source"],
      model: row.model,
      createdAt: row.created_at,
      scanRunId: row.scan_run_id,
      analyzedLotIds: JSON.parse(row.analyzed_lot_ids_json) as string[],
      summary: row.summary,
      topDeals: JSON.parse(row.top_deals_json) as BestDealInsight[]
    }));
  }

  getLatestAnalysisSnapshot(): AnalysisSnapshotRecord | null {
    const row = this.sqlite
      .prepare(`
        SELECT id, source, model, scan_run_id, created_at, summary, top_deals_json, analyzed_lot_ids_json
        FROM analysis_snapshots
        ORDER BY id DESC
        LIMIT 1
      `)
      .get() as AnalysisSnapshotRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      source: row.source as AnalysisSnapshotRecord["source"],
      model: row.model,
      createdAt: row.created_at,
      scanRunId: row.scan_run_id,
      analyzedLotIds: JSON.parse(row.analyzed_lot_ids_json) as string[],
      summary: row.summary,
      topDeals: JSON.parse(row.top_deals_json) as BestDealInsight[]
    };
  }

  insertDeliveryRun(params: {
    analysisSnapshotId: number;
    providerId: string;
    status: DeliveryStatus;
    createdAt: string;
    previewText: string;
    externalId: string | null;
    errorMessage?: string;
  }): DeliveryRunRecord {
    const result = this.sqlite
      .prepare(`
        INSERT INTO delivery_runs (
          analysis_snapshot_id, provider_id, status, created_at, preview_text, external_id, error_message
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        params.analysisSnapshotId,
        params.providerId,
        params.status,
        params.createdAt,
        params.previewText,
        params.externalId,
        params.errorMessage ?? null
      );

    return {
      id: Number(result.lastInsertRowid),
      analysisSnapshotId: params.analysisSnapshotId,
      providerId: params.providerId,
      status: params.status,
      createdAt: params.createdAt,
      previewText: params.previewText,
      externalId: params.externalId,
      errorMessage: params.errorMessage ?? null
    };
  }

  listDeliveryRuns(): DeliveryRunRecord[] {
    const rows = this.sqlite
      .prepare(`
        SELECT id, analysis_snapshot_id, provider_id, status, created_at, preview_text, external_id, error_message
        FROM delivery_runs
        ORDER BY id ASC
      `)
      .all() as unknown as DeliveryRunRow[];

    return rows.map((row) => ({
      id: row.id,
      analysisSnapshotId: row.analysis_snapshot_id,
      providerId: row.provider_id,
      status: row.status as DeliveryRunRecord["status"],
      createdAt: row.created_at,
      previewText: row.preview_text,
      externalId: row.external_id,
      errorMessage: row.error_message
    }));
  }

  getLatestDeliveryRun(): DeliveryRunRecord | null {
    const row = this.sqlite
      .prepare(`
        SELECT id, analysis_snapshot_id, provider_id, status, created_at, preview_text, external_id, error_message
        FROM delivery_runs
        ORDER BY id DESC
        LIMIT 1
      `)
      .get() as DeliveryRunRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      analysisSnapshotId: row.analysis_snapshot_id,
      providerId: row.provider_id,
      status: row.status as DeliveryRunRecord["status"],
      createdAt: row.created_at,
      previewText: row.preview_text,
      externalId: row.external_id,
      errorMessage: row.error_message
    };
  }

  close(): void {
    this.sqlite.close();
  }
}
