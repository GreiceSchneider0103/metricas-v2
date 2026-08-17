import { unwrap } from "../../lib/db.js";
import { supabaseAdmin } from "../../lib/supabase.js";

function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function uniqueSlug(baseName: string) {
  const base = slugify(baseName) || "empresa";
  let candidate = base;
  let attempt = 1;

  while (true) {
    const existing = unwrap(
      await supabaseAdmin.from("companies").select("id").eq("slug", candidate).maybeSingle()
    );
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
}

// Cria a empresa e ja vincula quem criou como "master" -- unico papel que
// nasce automaticamente; adm/agente sao sempre convidados por um master/adm
// existente (fase 4, modulo team).
export async function createCompany(input: { userId: string; name: string }) {
  const slug = await uniqueSlug(input.name);

  const company = unwrap(
    await supabaseAdmin
      .from("companies")
      .insert({ name: input.name.trim(), slug })
      .select("id, name, slug, created_at")
      .single()
  );

  const membershipResult = await supabaseAdmin.from("company_users").insert({
    company_id: company.id,
    user_id: input.userId,
    role: "master",
    is_active: true
  });

  if (membershipResult.error) {
    throw new Error(`Falha ao vincular usuario master a empresa: ${membershipResult.error.message}`);
  }

  return company;
}

export async function listMyCompanies(userId: string) {
  const memberships = unwrap(
    await supabaseAdmin
      .from("company_users")
      .select("role, is_active, companies ( id, name, slug )")
      .eq("user_id", userId)
      .eq("is_active", true)
  );

  return (memberships ?? []).map((row) => {
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    return {
      id: company?.id,
      name: company?.name,
      slug: company?.slug,
      role: row.role
    };
  });
}
