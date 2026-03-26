import { describe, expect, it } from "vitest";

import { mapApifyDatasetItemToRawLot } from "../src/adapters/spain/mapApifyDatasetItemToRawLot.js";

describe("Feature: apify-spain-source", () => {
  /**
   * GOAL: Lock the contract between the Apify BOE actor output and our
   *       internal raw lot schema before wiring the live source provider.
   *
   * WHY: The MVP depends on live BOE data. If this mapping drifts, the whole
   *      downstream pipeline breaks even though scan, AI, and delivery logic
   *      still compile.
   *
   * EXPECTED FLOW:
   *   1. Receive a dataset item from the Apify Spain BOE actor.
   *   2. Map Spanish field names into the shared raw lot contract.
   *   3. Preserve detail/document links required by the digest and review UI.
   */
  it("maps Apify BOE actor items into raw Spain lots", () => {
    const rawLot = mapApifyDatasetItemToRawLot({
      identificador: "SUB-JA-2025-255845",
      tipo_subasta: "JUDICIAL EN VÍA DE APREMIO",
      fecha_inicio: "2025-12-30T18:00:00+01:00",
      fecha_conclusion: "2026-01-19T18:00:00+01:00",
      valor_subasta: 305348,
      deposito: 15267.4,
      descripcion: "VIVIENDA en Calle Principal, habitable y sin ocupantes conocidos.",
      direccion: "C/ Mayor, 1",
      localidad: "Madrid",
      provincia: "Madrid",
      autoridad_nombre: "JUZGADO 1 INSTANCIA 5",
      detail_url: "https://subastas.boe.es/detalleSubasta.php?idSub=SUB-JA-2025-255845",
      google_maps_url: "https://www.google.com/maps/search/?api=1&query=C%2F+Mayor%2C+1",
      lotes_data: [
        {
          nombre: "Lote 1",
          financiero: { valor_subasta: 210000, deposito: 10500 },
          bien: { descripcion: "VIVIENDA en Calle Principal 1", direccion: "C/ Mayor, 1" }
        }
      ],
      documentos: [
        {
          titulo: "Certificación de Cargas",
          url: "https://api.apify.com/v2/key-value-stores/example-record"
        }
      ]
    });

    expect(rawLot).toMatchObject({
      id: "SUB-JA-2025-255845",
      url: "https://subastas.boe.es/detalleSubasta.php?idSub=SUB-JA-2025-255845",
      title: "Madrid apartment",
      assetType: "residential",
      propertySubtype: "apartment",
      municipality: "Madrid",
      province: "Madrid",
      assessedValue: 305348,
      depositRequired: 15267.4,
      court: "JUZGADO 1 INSTANCIA 5"
    });
    expect(rawLot.description).toContain("sin ocupantes");
  });
});
