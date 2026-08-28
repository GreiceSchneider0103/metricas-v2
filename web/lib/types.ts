export type CompanyRole = "master" | "adm" | "agente";

export type Company = {
  id: string;
  name: string;
  slug: string;
  role?: CompanyRole;
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
  ordersCount: number;
  unitsSold: number;
  revenue: number;
  avgTicket: number | null;
  visits: number;
  conversionRate: number | null;
};

export type SalesMapResponse = {
  period: { from: string; to: string };
  summary: { revenue: number; unitsSold: number; ordersCount: number; avgTicket: number | null; listingsCount: number };
  pagination: { page: number; pageSize: number; total: number };
  items: SalesMapItem[];
};

export type TeamMember = {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  role: CompanyRole;
  isActive: boolean;
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
