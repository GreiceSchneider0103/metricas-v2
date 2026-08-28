export type CompanyRole = "master" | "adm" | "agente";

export type AppTab = "mapa_vendas" | "atividades" | "alertas" | "configuracoes";

export type AuthContext = {
  userId: string;
  companyId: string;
  role: CompanyRole;
  isPlatformAdmin: boolean;
  allowedTabs: AppTab[];
};
