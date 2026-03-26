import type {
  AnalysisSnapshotRecord,
  DeliveryRunRecord,
  NormalizedLot,
  RuntimeProviderState,
  ScanRunRecord,
  SchedulerState
} from "../domain/types.js";

interface HomePageModel {
  lots: NormalizedLot[];
  scanRuns: ScanRunRecord[];
  latestAnalysis: AnalysisSnapshotRecord | null;
  latestDelivery: DeliveryRunRecord | null;
  schedulerState: SchedulerState;
  providerState: RuntimeProviderState;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not scheduled yet";
  }

  return `${new Date(value).toLocaleString("en-GB", { timeZone: "UTC" })} UTC`;
}

function renderLatestRun(scanRuns: ScanRunRecord[]): string {
  const latestRun = scanRuns.at(-1);

  if (!latestRun) {
    return `<p class="empty-state">No scan runs yet.</p>`;
  }

  const syncedCount = latestRun.importedCount + latestRun.updatedCount;
  const statusLabel = latestRun.status.charAt(0).toUpperCase() + latestRun.status.slice(1);

  return `
    <section class="panel status-panel" aria-label="Latest scan run">
      <p class="eyebrow">Latest Run</p>
      <p class="status-pill">${escapeHtml(statusLabel)}</p>
      <p class="status-copy">${syncedCount} lots synced</p>
      <p class="meta-copy">Started ${escapeHtml(formatTimestamp(latestRun.startedAt))}</p>
    </section>
  `;
}

function renderSchedulerStatus(schedulerState: SchedulerState): string {
  return `
    <section class="panel status-panel" aria-label="Scheduler status" data-testid="scheduler-status">
      <p class="eyebrow">Scheduler</p>
      <p class="status-copy">Every ${schedulerState.intervalMinutes} minutes</p>
      <p class="meta-copy">Next run ${escapeHtml(formatTimestamp(schedulerState.nextRunAt))}</p>
      <p class="meta-copy">Skipped overlaps ${escapeHtml(String(schedulerState.skippedRuns))}</p>
    </section>
  `;
}

function renderBestDeals(latestAnalysis: AnalysisSnapshotRecord | null): string {
  if (!latestAnalysis) {
    return `
      <section class="panel analysis-panel" data-testid="ai-best-deals">
        <p class="eyebrow">AI Best Deals</p>
        <p class="empty-state">Run the aggregation to generate the first best-deals analysis.</p>
      </section>
    `;
  }

  const dealsMarkup = latestAnalysis.topDeals
    .map(
      (deal) => `
        <article class="analysis-card">
          <div class="analysis-header">
            <div>
              <h3>${escapeHtml(deal.title)}</h3>
              <p class="analysis-verdict">${escapeHtml(deal.verdict)}</p>
            </div>
            <p class="analysis-score">${escapeHtml(`${deal.score}/100`)}</p>
          </div>
          <p class="analysis-summary">${escapeHtml(deal.summary)}</p>
          <ul class="reason-list">
            ${deal.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
          </ul>
          <a class="source-link" href="${escapeHtml(deal.sourceUrl)}" target="_blank" rel="noreferrer">
            Review ${escapeHtml(deal.title)} listing
          </a>
        </article>
      `
    )
    .join("");

  return `
    <section class="panel analysis-panel" data-testid="ai-best-deals">
      <p class="eyebrow">AI Best Deals</p>
      <h2>Best current opportunities</h2>
      <p class="analysis-summary">${escapeHtml(latestAnalysis.summary)}</p>
      <p class="meta-copy">Model ${escapeHtml(latestAnalysis.model)} • Updated ${escapeHtml(formatTimestamp(latestAnalysis.createdAt))}</p>
      <div class="analysis-grid">
        ${dealsMarkup}
      </div>
    </section>
  `;
}

function renderProviderStatus(providerState: RuntimeProviderState): string {
  return `
    <section class="panel status-panel" aria-label="Provider status" data-testid="provider-status">
      <p class="eyebrow">Providers</p>
      <p class="meta-copy">Source ${escapeHtml(providerState.source)}</p>
      <p class="meta-copy">Analyzer ${escapeHtml(providerState.analyzer)}</p>
      <p class="meta-copy">Delivery ${escapeHtml(providerState.delivery)}</p>
    </section>
  `;
}

function renderDigestPreview(latestDelivery: DeliveryRunRecord | null): string {
  if (!latestDelivery) {
    return `
      <section class="panel analysis-panel" data-testid="digest-preview">
        <p class="eyebrow">Digest Preview</p>
        <p class="empty-state">No digest has been generated yet.</p>
      </section>
    `;
  }

  return `
    <section class="panel analysis-panel" data-testid="digest-preview">
      <p class="eyebrow">Digest Preview</p>
      <p class="meta-copy">Provider ${escapeHtml(latestDelivery.providerId)} • Status ${escapeHtml(latestDelivery.status)}</p>
      <pre class="digest-preview">${escapeHtml(latestDelivery.previewText)}</pre>
    </section>
  `;
}

function renderLots(lots: NormalizedLot[]): string {
  if (lots.length === 0) {
    return `<p class="empty-state">Run the scan to populate normalized BOE lots.</p>`;
  }

  return lots
    .map(
      (lot) => `
        <article class="lot-card">
          <div class="lot-header">
            <h2>${escapeHtml(lot.title)}</h2>
            <p class="lot-badge">${escapeHtml(lot.assetType)}</p>
          </div>
          <p class="lot-location">${escapeHtml(`${lot.location.municipality}, ${lot.location.province}`)}</p>
          <dl class="lot-metrics">
            <div>
              <dt>Start</dt>
              <dd>${escapeHtml(formatPrice(lot.pricing.startingPrice))}</dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>${escapeHtml(`${lot.computed.discountPct}%`)}</dd>
            </div>
            <div>
              <dt>Price / m²</dt>
              <dd>${escapeHtml(lot.computed.pricePerSqm ? `${formatPrice(lot.computed.pricePerSqm)}` : "n/a")}</dd>
            </div>
          </dl>
          <p class="lot-description">${escapeHtml(lot.rawDescription)}</p>
          <a class="source-link" href="${escapeHtml(lot.sourceUrl)}" target="_blank" rel="noreferrer">
            Open ${escapeHtml(lot.title)} source
          </a>
        </article>
      `
    )
    .join("");
}

export function renderHomePage(model: HomePageModel): string {
  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Spain BOE Review</title>
        <style>
          :root {
            color-scheme: light;
            --background: #f7f1e8;
            --panel: rgba(255, 251, 245, 0.88);
            --panel-border: rgba(74, 60, 39, 0.18);
            --ink: #2a2118;
            --muted: #6f6356;
            --accent: #1f6f5f;
            --accent-soft: #d8ece7;
            --highlight: #b85c38;
            --link: #0d5f88;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            min-height: 100vh;
            font-family: "Iowan Old Style", "Palatino Linotype", serif;
            background:
              radial-gradient(circle at top left, rgba(184, 92, 56, 0.18), transparent 28%),
              radial-gradient(circle at top right, rgba(31, 111, 95, 0.18), transparent 24%),
              linear-gradient(180deg, #f5ecde 0%, var(--background) 48%, #efe3d2 100%);
            color: var(--ink);
          }

          main {
            max-width: 1080px;
            margin: 0 auto;
            padding: 48px 20px 64px;
          }

          .hero {
            display: grid;
            gap: 20px;
            margin-bottom: 28px;
          }

          .hero h1 {
            margin: 0;
            font-size: clamp(2.2rem, 5vw, 4.4rem);
            line-height: 0.96;
            letter-spacing: -0.04em;
          }

          .hero p {
            margin: 0;
            max-width: 720px;
            color: var(--muted);
            font-size: 1.05rem;
          }

          .layout {
            display: grid;
            gap: 20px;
          }

          .status-grid {
            display: grid;
            gap: 20px;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          }

          .panel,
          .lot-card,
          .analysis-card {
            background: var(--panel);
            backdrop-filter: blur(12px);
            border: 1px solid var(--panel-border);
            border-radius: 24px;
            box-shadow: 0 22px 60px rgba(62, 46, 26, 0.08);
          }

          .control-panel {
            padding: 22px;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 18px;
            align-items: center;
          }

          .control-panel form {
            margin: 0;
          }

          button {
            border: 0;
            border-radius: 999px;
            padding: 14px 22px;
            font: inherit;
            font-weight: 700;
            background: linear-gradient(135deg, var(--accent), #165146);
            color: #f8fbfa;
            cursor: pointer;
          }

          button:hover {
            background: linear-gradient(135deg, #24816d, #15493f);
          }

          .status-panel,
          .analysis-panel {
            padding: 22px;
          }

          .analysis-panel h2 {
            margin: 0 0 10px;
            font-size: 1.6rem;
          }

          .eyebrow {
            margin: 0 0 10px;
            text-transform: uppercase;
            letter-spacing: 0.14em;
            font-size: 0.78rem;
            color: var(--muted);
          }

          .status-pill {
            display: inline-flex;
            margin: 0 0 8px;
            padding: 7px 12px;
            border-radius: 999px;
            font-weight: 700;
            color: var(--accent);
            background: var(--accent-soft);
          }

          .status-copy {
            margin: 0;
            font-size: 1.15rem;
            font-weight: 700;
          }

          .meta-copy,
          .empty-state,
          .analysis-summary {
            margin: 10px 0 0;
            color: var(--muted);
          }

          .analysis-grid,
          .lots-grid {
            display: grid;
            gap: 18px;
          }

          .digest-preview {
            margin: 14px 0 0;
            padding: 16px;
            overflow-x: auto;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.65);
            color: var(--muted);
            white-space: pre-wrap;
            font-family: "SFMono-Regular", "Menlo", monospace;
            font-size: 0.92rem;
          }

          .lot-card,
          .analysis-card {
            padding: 20px;
          }

          .lot-header,
          .analysis-header {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: baseline;
          }

          .lot-header h2,
          .analysis-header h3 {
            margin: 0;
            font-size: 1.55rem;
          }

          .lot-badge,
          .analysis-verdict {
            margin: 0;
            text-transform: capitalize;
            color: var(--highlight);
            font-weight: 700;
          }

          .analysis-score {
            margin: 0;
            font-size: 1.3rem;
            font-weight: 700;
            color: var(--accent);
          }

          .lot-location,
          .lot-description {
            color: var(--muted);
          }

          .lot-metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 14px;
            padding: 16px 0;
            margin: 0;
          }

          .lot-metrics div {
            padding: 14px;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.62);
          }

          .lot-metrics dt {
            margin-bottom: 6px;
            color: var(--muted);
            font-size: 0.88rem;
          }

          .lot-metrics dd {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 700;
          }

          .source-link {
            display: inline-flex;
            margin-top: 14px;
            color: var(--link);
            font-weight: 700;
            text-decoration-thickness: 1px;
          }

          .reason-list {
            margin: 14px 0 0;
            padding-left: 18px;
            color: var(--muted);
          }

          @media (max-width: 720px) {
            main {
              padding-top: 32px;
            }

            .control-panel {
              align-items: stretch;
            }

            button {
              width: 100%;
            }

            .lot-header,
            .analysis-header {
              flex-direction: column;
            }
          }
        </style>
      </head>
      <body>
        <main>
          <section class="hero">
            <h1>Spain BOE Review</h1>
            <p>
              First vertical slice for the distressed-auction scanner. Trigger the configured Spain BOE scan,
              persist the raw payload plus normalized lots, review source links, and inspect the current best-deals analysis.
            </p>
          </section>

          <section class="panel control-panel">
            <div>
              <p class="eyebrow">Scan Control</p>
              <p class="meta-copy">Run the current Spain BOE source and refresh the live shortlist plus digest preview.</p>
            </div>
            <form method="post" action="/scans/spain-boe">
              <button type="submit">Run Spain BOE scan</button>
            </form>
          </section>

          <div class="layout">
            <section class="status-grid">
              ${renderLatestRun(model.scanRuns)}
              ${renderSchedulerStatus(model.schedulerState)}
              ${renderProviderStatus(model.providerState)}
            </section>
            ${renderBestDeals(model.latestAnalysis)}
            ${renderDigestPreview(model.latestDelivery)}
            <section class="lots-grid" aria-label="Normalized lots">
              ${renderLots(model.lots)}
            </section>
          </div>
        </main>
      </body>
    </html>
  `;
}
