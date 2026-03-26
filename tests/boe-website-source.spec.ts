import { describe, expect, it } from "vitest";

import { BoeWebsiteSpainBoeSource } from "../src/adapters/spain/BoeWebsiteSpainBoeSource.js";

describe("Feature: boe-website-source", () => {
  /**
   * GOAL: Lock a deterministic contract for the direct BOE website source
   *       before wiring it into the live aggregation path.
   *
   * WHY: The current Apify-based live path is brittle for this environment.
   *      A direct BOE scraper needs regression coverage so we can trust the
   *      production scan without depending on a third-party actor.
   *
   * EXPECTED FLOW:
   *   1. Load the search results page and discover active housing auctions.
   *   2. Fetch the main, authority, and goods detail pages for each lot.
   *   3. Normalize the scraped fields into the shared raw lot contract.
   */
  it("loads active housing lots directly from the BOE website pages", async () => {
    const searchHtml = `
      <ul>
        <li class="resultado-busqueda">
          <h3>SUBASTA SUB-JA-2025-251395</h3>
          <p>Estado: Celebrándose - [Conclusión prevista: 26/03/2026 a las 18:00:00]</p>
          <p>Id. lote. 251395L01. Finca registral 25780. Piso en Murcia.</p>
          <a href="./detalleSubasta.php?idSub=SUB-JA-2025-251395&idBus=abc" class="resultado-busqueda-link-otro">
            Más... (Referencia SUB-JA-2025-251395)
          </a>
        </li>
      </ul>
    `;

    const summaryHtml = `
      <table>
        <tr><th>Identificador</th><td><strong>SUB-JA-2025-251395</strong></td></tr>
        <tr><th>Cuenta expediente</th><td>3728 3105 06 0329 21</td></tr>
        <tr><th>Fecha de inicio</th><td>06-03-2026 18:00:00 CET  (ISO: 2026-03-06T18:00:00+01:00)</td></tr>
        <tr><th>Fecha de conclusión</th><td><strong class="destaca">26-03-2026 18:00:00 CET </strong> (ISO: 2026-03-26T18:00:00+01:00)</td></tr>
        <tr><th>Valor subasta</th><td>160.654,79 €</td></tr>
        <tr><th>Tasación</th><td>0,00 €</td></tr>
        <tr><th>Importe del depósito</th><td>8.032,74 €</td></tr>
      </table>
    `;

    const authorityHtml = `
      <table>
        <tr><th>Descripción</th><td>UNIDAD SUBASTAS JUDICIALES MURCIA</td></tr>
      </table>
    `;

    const goodsHtml = `
      <div class="bloque" id="idBloqueLote1">
        <div class="caja">Id. lote. 251395L01. Finca registral 25780. Piso en Murcia</div>
        <h4>Bien 1 - Inmueble (Vivienda)</h4>
        <table>
          <tr>
            <th>Descripción</th>
            <td>
              URBANA.- Piso con una superficie construida de 70,50 m2 y útil de 55,92 m2.
              Dirección catastral: CL BOCIO 4 Pl:01 Pt:DR 30004 MURCIA.
            </td>
          </tr>
          <tr><th>Dirección</th><td>CL BOCIO 4</td></tr>
          <tr><th>Localidad</th><td>Murcia</td></tr>
          <tr><th>Provincia</th><td>Murcia</td></tr>
        </table>
      </div>
    `;

    const fetchMock: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes("subastas_ava.php")) {
        return new Response(searchHtml, { status: 200, headers: { "Content-Type": "text/html" } });
      }

      if (url.includes("detalleSubasta.php") && url.includes("ver=2")) {
        return new Response(authorityHtml, { status: 200, headers: { "Content-Type": "text/html" } });
      }

      if (url.includes("detalleSubasta.php") && url.includes("ver=3")) {
        return new Response(goodsHtml, { status: 200, headers: { "Content-Type": "text/html" } });
      }

      if (url.includes("detalleSubasta.php")) {
        return new Response(summaryHtml, { status: 200, headers: { "Content-Type": "text/html" } });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    };

    const source = new BoeWebsiteSpainBoeSource({
      fetch: fetchMock,
      maxResults: 1
    });

    const lots = await source.loadLots();

    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({
      id: "SUB-JA-2025-251395",
      url: "https://subastas.boe.es/detalleSubasta.php?idSub=SUB-JA-2025-251395",
      title: "Murcia apartment",
      assetType: "residential",
      propertySubtype: "apartment",
      region: "Murcia",
      province: "Murcia",
      municipality: "Murcia",
      address: "CL BOCIO 4",
      areaSqm: 70.5,
      assessedValue: 160654.79,
      startingPrice: 112458.35,
      depositRequired: 8032.74,
      startDate: "2026-03-06T18:00:00+01:00",
      endDate: "2026-03-26T18:00:00+01:00",
      status: "active",
      court: "UNIDAD SUBASTAS JUDICIALES MURCIA",
      procedureNumber: "3728 3105 06 0329 21"
    });
    expect(lots[0]?.description).toContain("superficie construida");
  });
});
