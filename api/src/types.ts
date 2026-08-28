export type CompanyRole = "master" | "adm" | "agente";

export type AuthContext = {
  userId: string;
  companyId: string;
  role: CompanyRole;
  isPlatformAdmin: boolean;
};
