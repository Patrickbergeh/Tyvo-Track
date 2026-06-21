import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export const ThemeToggle = () => {
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );

  const toggle = () => {
    const next = !dark;
    // Desabilita transições durante a troca para evitar flicker
    document.documentElement.classList.add("no-transitions");
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
    setDark(next);
    // Reabilita transições no próximo frame
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("no-transitions");
    });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="rounded-full h-9 w-9 border border-border bg-card hover:bg-accent transition-colors"
    >
      {dark ? (
        <Sun className="h-4 w-4 text-warning" />
      ) : (
        <Moon className="h-4 w-4 text-primary" />
      )}
    </Button>
  );
};
