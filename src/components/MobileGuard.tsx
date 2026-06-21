import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";

// Detecção por DISPOSITIVO (não por largura de tela): um desktop com a janela
// estreita NÃO é bloqueado; só celulares/tablets reais.
function detectMobile() {
  if (typeof window === "undefined") return false;

  // 1) API moderna (Chromium): informa se é um dispositivo móvel de verdade
  const uaData = (navigator as unknown as { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData && typeof uaData.mobile === "boolean") return uaData.mobile;

  // 2) Fallback pelo user-agent do dispositivo
  const ua = navigator.userAgent || (navigator as unknown as { vendor?: string }).vendor || "";
  if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua)) return true;

  // 3) iPad no iOS 13+ se identifica como "Macintosh" — diferencia por toque real
  if (/iPad/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;

  return false;
}

export function MobileGuard({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(detectMobile);

  useEffect(() => {
    // Reavalia uma vez após montar (caso userAgentData resolva tarde)
    setIsMobile(detectMobile());
  }, []);

  if (!isMobile) return <>{children}</>;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "32px",
        background: "linear-gradient(160deg, #0b0d14 0%, #131726 100%)",
        color: "#fff",
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(124, 99, 255, 0.15)",
          border: "1px solid rgba(124, 99, 255, 0.4)",
          marginBottom: 28,
        }}
      >
        <Monitor size={38} color="#a594ff" />
      </div>

      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          margin: "0 0 12px",
          letterSpacing: "-0.02em",
        }}
      >
        Acesso somente no computador
      </h1>

      <p
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          maxWidth: 340,
          margin: 0,
          color: "rgba(255,255,255,0.7)",
        }}
      >
        Esta plataforma não está disponível em celulares ou tablets. Para
        acessar, abra o link em um computador (desktop ou notebook).
      </p>
    </div>
  );
}
