import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertTabAllowed, getAuthContext } from "../../plugins/auth.js";
import {
  getLinkedListings,
  getListingTimeseries,
  getSalesMap,
  getSalesMapCalendar,
  searchListingsForPicker,
  type SalesMapSortField
} from "./service.js";

const booleanQueryParam = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean().optional());

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "deve estar no formato YYYY-MM-DD");
const isoMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "deve estar no formato YYYY-MM");

const filtersSchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["active", "paused", "closed", "under_review"]).optional(),
  listingType: z.enum(["classic", "premium"]).optional(),
  logisticType: z.string().trim().min(1).optional(),
  isCatalog: booleanQueryParam,
  abcCurve: z.enum(["A", "B", "C"]).optional(),
  hasAds: booleanQueryParam,
  hasPromotion: booleanQueryParam,
  channel: z.enum(["mercado_livre", "magalu"]).default("mercado_livre"),
  listingId: z.string().uuid().optional()
});

const sortSchema = z.enum(["revenue", "unitsSold", "ordersCount", "avgTicket", "title"]).default("revenue");

const querySchema = filtersSchema
  .extend({
    from: isoDate,
    to: isoDate,
    sort: sortSchema,
    sortDir: z.enum(["asc", "desc"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50)
  })
  .refine((value) => value.from <= value.to, { message: "from deve ser <= to", path: ["from"] });

const calendarQuerySchema = filtersSchema.extend({
  month: isoMonth,
  sort: sortSchema,
  sortDir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Teto bem acima do usado na tela (50) -- o botao "Exportar CSV" pede o
  // catalogo inteiro numa chamada so, sem paginar.
  pageSize: z.coerce.number().int().min(1).max(1000).default(50)
});

const listingIdParamsSchema = z.object({ listingId: z.string().uuid() });

const timeseriesQuerySchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((value) => value.from <= value.to, { message: "from deve ser <= to", path: ["from"] });

export async function salesMapRoutes(app: FastifyInstance) {
  // Fase 3: mapa de vendas. So le de listings + listing_daily_snapshot (ver
  // service.ts) -- nunca recalcula de orders/order_items na request.
  app.get("/sales-map", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "mapa_vendas");
    const query = querySchema.parse(request.query ?? {});
    const sortField = query.sort as SalesMapSortField;
    const sortDir = query.sortDir ?? (sortField === "title" ? "asc" : "desc");

    return getSalesMap({
      companyId: context.companyId,
      from: query.from,
      to: query.to,
      filters: {
        search: query.search,
        status: query.status,
        listingType: query.listingType,
        logisticType: query.logisticType,
        isCatalog: query.isCatalog,
        abcCurve: query.abcCurve,
        hasAds: query.hasAds,
        hasPromotion: query.hasPromotion,
        channel: query.channel,
        listingId: query.listingId
      },
      sort: sortField,
      sortDir,
      page: query.page,
      pageSize: query.pageSize
    });
  });

  // Mapa de vendas em calendario: heatmap dia a dia por anuncio, com meta
  // diaria (goals com metric_code=units_sold, ver service.ts) e tendencia.
  app.get("/sales-map/calendar", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "mapa_vendas");
    const query = calendarQuerySchema.parse(request.query ?? {});
    const sortField = query.sort as SalesMapSortField;
    const sortDir = query.sortDir ?? (sortField === "title" ? "asc" : "desc");

    return getSalesMapCalendar({
      companyId: context.companyId,
      month: query.month,
      filters: {
        search: query.search,
        status: query.status,
        listingType: query.listingType,
        logisticType: query.logisticType,
        isCatalog: query.isCatalog,
        abcCurve: query.abcCurve,
        hasAds: query.hasAds,
        hasPromotion: query.hasPromotion,
        channel: query.channel,
        listingId: query.listingId
      },
      sort: sortField,
      sortDir,
      page: query.page,
      pageSize: query.pageSize
    });
  });

  app.get("/sales-map/:listingId/linked", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "mapa_vendas");
    const params = listingIdParamsSchema.parse(request.params);
    const query = z.object({ from: isoDate.optional(), to: isoDate.optional() }).parse(request.query ?? {});
    const period = query.from && query.to ? { from: query.from, to: query.to } : undefined;
    return { items: await getLinkedListings(context.companyId, params.listingId, period) };
  });

  // Serie temporal diaria por anuncio (grafico no drawer) + variacao vs
  // periodo imediatamente anterior de mesma duracao (ver service.ts).
  app.get("/sales-map/:listingId/timeseries", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, "mapa_vendas");
    const params = listingIdParamsSchema.parse(request.params);
    const query = timeseriesQuerySchema.parse(request.query ?? {});
    return getListingTimeseries({ companyId: context.companyId, listingId: params.listingId, from: query.from, to: query.to });
  });

  // Usado pelo autocomplete de "anuncio vinculado" no formulario de
  // atividades -- so identidade (id/externalId/title), sem periodo. Liberado
  // pra quem tem mapa_vendas OU atividades (e chamado a partir de la).
  app.get("/sales-map/lookup", async (request) => {
    const context = await getAuthContext(request);
    assertTabAllowed(request, context, ["mapa_vendas", "atividades"]);
    const query = z.object({ q: z.string().trim().min(2).max(120) }).parse(request.query ?? {});
    return { items: await searchListingsForPicker(context.companyId, query.q) };
  });
}
