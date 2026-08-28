import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthContext } from "../../plugins/auth.js";
import {
  getLinkedListings,
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
  hasPromotion: booleanQueryParam
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
  pageSize: z.coerce.number().int().min(1).max(50).default(50)
});

const listingIdParamsSchema = z.object({ listingId: z.string().uuid() });

export async function salesMapRoutes(app: FastifyInstance) {
  // Fase 3: mapa de vendas. So le de listings + listing_daily_snapshot (ver
  // service.ts) -- nunca recalcula de orders/order_items na request.
  app.get("/sales-map", async (request) => {
    const context = await getAuthContext(request);
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
        hasPromotion: query.hasPromotion
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
        hasPromotion: query.hasPromotion
      },
      sort: sortField,
      sortDir,
      page: query.page,
      pageSize: query.pageSize
    });
  });

  app.get("/sales-map/:listingId/linked", async (request) => {
    const context = await getAuthContext(request);
    const params = listingIdParamsSchema.parse(request.params);
    return { items: await getLinkedListings(context.companyId, params.listingId) };
  });

  // Usado pelo autocomplete de "anuncio vinculado" no formulario de
  // atividades -- so identidade (id/externalId/title), sem periodo.
  app.get("/sales-map/lookup", async (request) => {
    const context = await getAuthContext(request);
    const query = z.object({ q: z.string().trim().min(2).max(120) }).parse(request.query ?? {});
    return { items: await searchListingsForPicker(context.companyId, query.q) };
  });
}
