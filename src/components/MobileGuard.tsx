import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";

const MOBILE_BREAKPOINT = 1024;

function detectMobile() {
  if (typeof window === "undefined") return false;
  const byWidth = window.innerWidth < MOBILE_BREAKPOINT;
  const byAgent =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
      navigator.userAgent
    );
  const byTouch =
    "ontouchstart" in window && navigator.maxTouchPoints > 0 && byWidth;
  return byWidth || byAgent || byTouch;
}

export function MobileGuard({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(detectMobile);

  useEffect(() => {
    const onResize = () => setIsMobile(detectMobile());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
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
