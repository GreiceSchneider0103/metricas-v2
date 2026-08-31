export type CompanyRole = "master" | "adm" | "agente";

export type AppTab = "mapa_vendas" | "atividades" | "alertas" | "configuracoes";

export const APP_TAB_LABELS: Record<AppTab, string> = {
  mapa_vendas: "Mapa de vendas",
  atividades: "Atividades",
  alertas: "Alertas",
  configuracoes: "Configurações"
};

export type Company = {
  id: string;
  name: string;
  slug: string;
  role?: CompanyRole;
  allowedTabs?: AppTab[];
  created_at?: string;
};

export type IntegrationAccount = {
  id: string;
  seller_id: string;
  nickname: string;
  status: string;
  last_synced_at: string | null;
  connected_at: string;
  token_expires_at: string | null;
  listingsCount: number;
};

export type IntegrationStatus = {
  connected: boolean;
  accounts: IntegrationAccount[];
};

export type SalesMapItem = {
  listingId: string;
  externalId: string;
  title: string;
  categoryName: string | null;
  status: string;
  permalink: string | null;
  listingType: string | null;
  logisticType: string | null;
  isCatalog: boolean;
  abcCurve: string | null;
  currentPrice: number;
  currentStock: number;
  hasAds: boolean;
  hasPromotion: boolean;
  sku: string | null;
  ordersCount: number;
  unitsSold: number;
  revenue: number;
  avgTicket: number | null;
  visits: number;
  conversionRate: number | null;
};

export type PeriodVariance = {
  revenuePercent: number | null;
  unitsSoldPercent: number | null;
  ordersCountPercent: number | null;
  visitsPercent: number | null;
};

export type SalesMapResponse = {
  period: { from: string; to: string };
  summary: {
    revenue: number;
    unitsSold: number;
    ordersCount: number;
    visits: number;
    avgTicket: number | null;
    conversionRate: number | null;
    listingsCount: number;
    previousPeriod: { from: string; to: string; revenue: number; unitsSold: number; ordersCount: number; visits: number };
    variance: PeriodVariance;
  };
  pagination: { page: number; pageSize: number; total: number };
  items: SalesMapItem[];
};

export type CalendarDay = {
  date: string;
  unitsSold: number;
  revenue: number;
  ordersCount: number;
  visits: number;
  price: number | null;
  priceChange: "up" | "down" | "same" | null;
  targetStatus: "hit" | "miss" | "none";
};

export type CalendarListing = {
  listingId: string;
  externalId: string;
  title: string;
  permalink: string | null;
  status: string;
  listingType: string | null;
  abcCurve: string | null;
  hasAds: boolean;
  hasPromotion: boolean;
  sku: string | null;
  currentStock: number;
  days: CalendarDay[];
  totals: { unitsSold: number; revenue: number; ordersCount: number; visits: number };
  avgTicket: number | null;
  avgDailyUnits: number;
  conversionRate: number | null;
  daysOfStock: number | null;
  trend: "up" | "down" | "flat";
  goal: { id: string; monthlyTargetUnits: number; dailyTargetUnits: number; progressPercent: number | null } | null;
};

export type SalesMapCalendarResponse = {
  month: string;
  period: { from: string; to: string };
  pagination: { page: number; pageSize: number; total: number };
  items: CalendarListing[];
};

export type LinkedListing = {
  listingId: string;
  externalId: string;
  title: string;
  status: string;
  permalink: string | null;
  unitsSold: number;
};

export type TimeseriesPoint = {
  date: string;
  unitsSold: number;
  revenue: number;
  ordersCount: number;
  visits: number;
  price: number | null;
};

export type ListingTimeseriesResponse = {
  listingId: string;
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string };
  series: TimeseriesPoint[];
  totals: { unitsSold: number; revenue: number; ordersCount: number; visits: number };
  previousTotals: { unitsSold: number; revenue: number; ordersCount: number; visits: number };
  variance: PeriodVariance;
};

export type TeamMember = {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  role: CompanyRole;
  isActive: boolean;
  allowedTabs: AppTab[];
  createdAt: string;
};

export type UserMembership = {
  membershipId: string;
  companyId: string;
  companyName: string | null;
  role: CompanyRole;
  isActive: boolean;
  allowedTabs: AppTab[];
  createdAt: string;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "waiting" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  dueDate: string | null;
  assignedTo: string | null;
  createdBy: string | null;
  relatedListingId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Goal = {
  id: string;
  name: string;
  metricCode: "revenue" | "units_sold" | "orders_count" | "visits";
  targetValue: number;
  periodStart: string;
  periodEnd: string;
  listingId: string | null;
  ownerId: string | null;
  status: "active" | "achieved" | "missed" | "cancelled";
  createdAt: string;
};

export type GoalProgress = {
  goalId: string;
  metricCode: string;
  targetValue: number;
  achievedValue: number;
  progressPercent: number | null;
};

export type Alert = {
  id: string;
  listingId: string | null;
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string | null;
  status: "open" | "resolved" | "muted";
  createdAt: string;
  resolvedAt: string | null;
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export type Paginated<T> = { items: T[]; pagination: { page: number; pageSize: number; total: number } };

export type CompanySearchResult = { id: string; name: string; slug: string };

export type AccessRequest = {
  id: string;
  userId: string;
  companyId: string;
  status: "pending" | "approved" | "rejected";
  fullName: string | null;
  email: string | null;
  companyName: string | null;
  createdAt: string;
};
