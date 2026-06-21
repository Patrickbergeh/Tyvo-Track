import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Layers, ChartColumnBig, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { label: "Base",       icon: LayoutDashboard, path: "/"          },
  { label: "Relatório",  icon: ChartColumnBig,  path: "/relatorio" },
  { label: "Codmov",     icon: Layers,          path: "/codmov"    },
];

export function AppSidebar() {
  const navigate  = useNavigate();
  const { pathname } = useLocation();

  return (
    <aside className="group w-14 hover:w-52 rounded-xl border border-border bg-card flex flex-col shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out p-2 gap-1">
      {NAV.map(({ label, icon: Icon, path }) => {
        const active = pathname === path;
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={`w-full flex items-center py-2 rounded-lg text-sm font-medium transition-colors overflow-hidden
              ${active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"}`}
          >
            <span className="w-10 flex items-center justify-center shrink-0">
              <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
            </span>
            <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75 pr-2">
              {label}
            </span>
          </button>
        );
      })}

      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-auto w-full flex items-center py-2 rounded-lg text-sm font-medium transition-colors overflow-hidden text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      >
        <span className="w-10 flex items-center justify-center shrink-0">
          <LogOut className="h-4 w-4" />
        </span>
        <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75 pr-2">
          Sair
        </span>
      </button>
    </aside>
  );
}
