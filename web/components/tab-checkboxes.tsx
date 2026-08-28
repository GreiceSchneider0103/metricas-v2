import { APP_TAB_LABELS, type AppTab } from "@/lib/types";

const ALL_TABS: AppTab[] = ["mapa_vendas", "atividades", "alertas", "configuracoes"];

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

  return (
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
  );
}
