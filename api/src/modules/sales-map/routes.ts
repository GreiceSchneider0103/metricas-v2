import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthContext } from "../../plugins/auth.js";
import { getSalesMap, type SalesMapSortField } from "./service.js";

const booleanQueryParam = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean().optional());

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "deve estar no formato YYYY-MM-DD");

const querySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    search: z.string().trim().min(1).optional(),
    status: z.enum(["active", "paused", "closed", "under_review"]).optional(),
    listingType: z.enum(["classic", "premium"]).optional(),
    logisticType: z.string().trim().min(1).optional(),
    isCatalog: booleanQueryParam,
    abcCurve: z.enum(["A", "B", "C"]).optional(),
    hasAds: booleanQueryParam,
    hasPromotion: booleanQueryParam,
    sort: z.enum(["revenue", "unitsSold", "ordersCount", "avgTicket", "title"]).default("revenue"),
    sortDir: z.enum(["asc", "desc"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50)
  })
  .refine((value) => value.from <= value.to, { message: "from deve ser <= to", path: ["from"] });

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
}
