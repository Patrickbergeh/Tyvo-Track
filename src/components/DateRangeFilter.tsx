import { useState } from "react";
import { startOfDay, endOfDay, subDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  const [picking, setPicking] = useState<{ from?: Date; to?: Date }>({});

  const handlePreset = (preset: DatePreset) => {
    if (preset === "all") {
      onChange("all", null);
    } else if (preset !== "custom") {
      onChange(preset, getPresetRange(preset as Exclude<DatePreset, "all" | "custom">));
    } else {
      setOpen(true);
    }
  };

  const handleDayClick = (day: Date | undefined) => {
    if (!day) return;
    if (!picking.from || (picking.from && picking.to)) {
      setPicking({ from: startOfDay(day) });
    } else {
      const from = picking.from;
      const to = endOfDay(day >= from ? day : from);
      const correctedFrom = day >= from ? from : startOfDay(day);
      setPicking({});
      setOpen(false);
      onChange("custom", { from: correctedFrom, to });
    }
  };

  const formatCustomLabel = () => {
    if (!customRange) return "Personalizado";
    const f = (d: Date) => format(d, "dd/MM/yyyy", { locale: ptBR });
    return `${f(customRange.from)} – ${f(customRange.to)}`;
  };

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {PRESETS.map((p) => {
        const isActive = value === p.id;
        return p.id === "custom" ? (
          <Popover key="custom" open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPicking({}); }}>
            <PopoverTrigger asChild>
              <button
                onClick={() => handlePreset("custom")}
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
              <div className="px-4 pt-3 pb-1 border-b border-border bg-muted/40">
                <p className="text-xs font-semibold text-foreground">Selecione o período</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {picking.from
                    ? `Início: ${format(picking.from, "dd/MM/yyyy", { locale: ptBR })} — clique no fim`
                    : "Clique no dia de início"}
                </p>
              </div>
              <Calendar
                mode="single"
                locale={ptBR}
                selected={picking.from}
                onSelect={handleDayClick}
                disabled={(d) => d > new Date()}
                modifiers={
                  picking.from && picking.to
                    ? { range_start: picking.from, range_end: picking.to }
                    : picking.from
                    ? { range_start: picking.from }
                    : {}
                }
                modifiersClassNames={{
                  range_start: "bg-primary text-primary-foreground rounded-full",
                  range_end:   "bg-primary text-primary-foreground rounded-full",
                }}
                className="p-3"
              />
              {picking.from && (
                <div className="px-3 pb-3 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground h-7"
                    onClick={() => setPicking({})}
                  >
                    Limpar
                  </Button>
                </div>
              )}
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
