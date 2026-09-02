import { APP_TAB_LABELS, type AppTab } from "@/lib/types";

const ALL_TABS: AppTab[] = ["mapa_vendas", "atividades", "alertas", "configuracoes"];

// Presets cobrem os casos mais comuns de convite/edicao de permissao sem
// precisar marcar caixa por caixa -- a matriz de checkboxes continua embaixo
// pra quem precisar de uma combinacao fora desses 3 perfis.
const PRESETS: { id: string; label: string; tabs: AppTab[] }[] = [
  { id: "full", label: "Acesso total", tabs: ["mapa_vendas", "atividades", "alertas", "configuracoes"] },
  { id: "operacional", label: "Operacional (sem Configurações)", tabs: ["mapa_vendas", "atividades", "alertas"] },
  { id: "vendas", label: "Só Mapa de vendas", tabs: ["mapa_vendas"] }
];
const CUSTOM_PRESET_ID = "custom";

function sameTabs(a: AppTab[], b: AppTab[]) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((tab) => setB.has(tab));
}

function matchingPresetId(value: AppTab[]) {
  return PRESETS.find((preset) => sameTabs(preset.tabs, value))?.id ?? CUSTOM_PRESET_ID;
}

export function TabCheckboxes({
  value,
  onChange,
  disabled
}: {
  value: AppTab[];
  onChange: (tabs: AppTab[]) => void;
  disabled?: boolean;
}) {
  function toggle(tab: AppTab) {
    if (value.includes(tab)) {
      onChange(value.filter((item) => item !== tab));
    } else {
      onChange([...value, tab]);
    }
  }

  function applyPreset(presetId: string) {
    const preset = PRESETS.find((item) => item.id === presetId);
    if (preset) onChange(preset.tabs);
  }

  return (
    <div className="space-y-2">
      <select
        value={matchingPresetId(value)}
        disabled={disabled}
        onChange={(e) => applyPreset(e.target.value)}
        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600"
      >
        {PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
        <option value={CUSTOM_PRESET_ID} disabled>
          Personalizado (marque abaixo)
        </option>
      </select>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {ALL_TABS.map((tab) => (
          <label key={tab} className="flex items-center gap-1.5 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={value.includes(tab)}
              disabled={disabled}
              onChange={() => toggle(tab)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
            />
            {APP_TAB_LABELS[tab]}
          </label>
        ))}
      </div>
    </div>
  );
}
