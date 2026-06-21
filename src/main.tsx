import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Index from "./pages/Index";
import Settings from "./pages/Settings";
import Codmov from "./pages/Codmov";
import Report from "./pages/Report";
import { AppShell } from "./components/AppShell";
import { MobileGuard } from "./components/MobileGuard";
import { AuthGate } from "./components/AuthGate";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <MobileGuard>
    <AuthGate>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Index />} />
              <Route path="/relatorio" element={<Report />} />
              <Route path="/codmov" element={<Codmov />} />
            </Route>
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </AuthGate>
  </MobileGuard>
);
