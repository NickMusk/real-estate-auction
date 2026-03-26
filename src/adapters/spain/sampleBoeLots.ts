import type { RawSpainBoeLot } from "../../domain/types.js";

export const sampleBoeLots: RawSpainBoeLot[] = [
  {
    id: "SUB-JA-2026-241891",
    url: "https://subastas.boe.es/ds.php?id=SUB-JA-2026-241891",
    title: "Valencia apartment",
    assetType: "residential",
    propertySubtype: "apartment",
    region: "Comunidad Valenciana",
    province: "Valencia",
    municipality: "Valencia",
    address: "Calle de la Paz 15, 3º",
    coordinates: {
      lat: 39.4699,
      lng: -0.3763
    },
    areaSqm: 95,
    assessedValue: 180000,
    startingPrice: 126000,
    depositRequired: 8820,
    startDate: "2026-04-01T10:00:00.000Z",
    endDate: "2026-04-21T10:00:00.000Z",
    status: "active",
    court: "Juzgado de Primera Instancia n\u00ba 5 de Valencia",
    procedureNumber: "4513444400221723",
    description:
      "Piso de 95m2 en planta tercera con balcon en el centro historico de Valencia. Vivienda habitable, sin ocupantes conocidos y con pequena deuda municipal pendiente."
  },
  {
    id: "SUB-JA-2026-241954",
    url: "https://subastas.boe.es/ds.php?id=SUB-JA-2026-241954",
    title: "Malaga development land",
    assetType: "land",
    propertySubtype: "plot",
    region: "Andalucia",
    province: "Malaga",
    municipality: "Malaga",
    address: "Sector SUP-T.8 Campanillas",
    coordinates: {
      lat: 36.7196,
      lng: -4.4717
    },
    areaSqm: 420,
    assessedValue: 210000,
    startingPrice: 147000,
    depositRequired: 10290,
    startDate: "2026-04-03T09:00:00.000Z",
    endDate: "2026-04-24T09:00:00.000Z",
    status: "active",
    court: "Juzgado Mercantil n\u00ba 2 de Malaga",
    procedureNumber: "2906744400221704",
    description:
      "Parcela urbana de 420m2 apta para promocion residencial. Sin edificaciones existentes. Activo orientado a desarrollo, con acceso por vial urbanizado."
  }
];
