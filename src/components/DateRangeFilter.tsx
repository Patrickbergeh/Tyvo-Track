import { useState } from "react";
import { startOfDay, endOfDay, subDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange as PickRange } from "react-day-picker";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type DatePreset = "all" | "today" | "yesterday" | "7d" | "30d" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
}

export function getPresetRange(preset: Exclude<DatePreset, "all" | "custom">): DateRange {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "30d":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
  }
}

const PRESETS: { id: DatePreset; label: string }[] = [
  { id: "all",       label: "Padrão" },
  { id: "today",     label: "Hoje" },
  { id: "yesterday", label: "Ontem" },
  { id: "7d",        label: "7 dias" },
  { id: "30d",       label: "30 dias" },
  { id: "custom",    label: "Personalizado" },
];

interface Props {
  value: DatePreset;
  customRange: DateRange | null;
  onChange: (preset: DatePreset, range: DateRange | null) => void;
}

export const DateRangeFilter = ({ value, customRange, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<PickRange | undefined>(undefined);

  // Abre o popover já com a seleção atual (se houver)
  const openCustom = () => {
    setPicking(customRange ? { from: customRange.from, to: customRange.to } : undefined);
    setOpen(true);
  };

  const handlePreset = (preset: DatePreset) => {
    if (preset === "all") {
      onChange("all", null);
    } else if (preset !== "custom") {
      onChange(preset, getPresetRange(preset as Exclude<DatePreset, "all" | "custom">));
    } else {
      openCustom();
    }
  };

  const apply = () => {
    if (!picking?.from || !picking?.to) return;
    onChange("custom", { from: startOfDay(picking.from), to: endOfDay(picking.to) });
    setOpen(false);
  };

  const fmt = (d: Date) => format(d, "dd/MM/yyyy", { locale: ptBR });
  const formatCustomLabel = () =>
    customRange ? `${fmt(customRange.from)} – ${fmt(customRange.to)}` : "Personalizado";

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {PRESETS.map((p) => {
        const isActive = value === p.id;
        return p.id === "custom" ? (
          <Popover
            key="custom"
            open={open}
            onOpenChange={(o) => { setOpen(o); if (o) setPicking(customRange ? { from: customRange.from, to: customRange.to } : undefined); }}
          >
            <PopoverTrigger asChild>
              <button
                onClick={openCustom}
                className={cn(
                  "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground"
                )}
              >
                <CalendarIcon className="h-3 w-3 shrink-0" />
                {isActive ? formatCustomLabel() : "Personalizado"}
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-auto p-0 border border-border shadow-xl rounded-xl overflow-hidden"
            >
              {/* Marcação de início e fim */}
              <div className="flex items-stretch border-b border-border bg-muted/40 text-xs">
                <div className="flex-1 px-4 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Início</p>
                  <p className={cn("font-semibold mt-0.5", picking?.from ? "text-foreground" : "text-muted-foreground/50")}>
                    {picking?.from ? fmt(picking.from) : "—"}
                  </p>
                </div>
                <div className="w-px bg-border" />
                <div className="flex-1 px-4 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Fim</p>
                  <p className={cn("font-semibold mt-0.5", picking?.to ? "text-foreground" : "text-muted-foreground/50")}>
                    {picking?.to ? fmt(picking.to) : "—"}
                  </p>
                </div>
              </div>

              <Calendar
                mode="range"
                locale={ptBR}
                numberOfMonths={2}
                selected={picking}
                onSelect={setPicking}
                defaultMonth={customRange?.from ?? subDays(new Date(), 30)}
                disabled={(d) => d > new Date()}
                className="p-3"
              />

              <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1 border-t border-border">
                <Button
                  variant="ghost" size="sm"
                  className="text-xs text-muted-foreground h-8"
                  onClick={() => setPicking(undefined)}
                >
                  Limpar
                </Button>
                <Button
                  size="sm"
                  className="text-xs h-8"
                  disabled={!picking?.from || !picking?.to}
                  onClick={apply}
                >
                  Aplicar período
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          <button
            key={p.id}
            onClick={() => handlePreset(p.id)}
            className={cn(
              "inline-flex items-center h-8 px-3 rounded-full text-xs font-medium border transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground"
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
};
