import { useState, useRef, useEffect } from "react";

interface Props {
  value: number;
  className?: string;
}

export function AnimatedNumber({ value, className }: Props) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number | null>(null);
  const fromRef = useRef(value);

  useEffect(() => {
    if (fromRef.current === value) return;

    const startFrom = fromRef.current;
    startTsRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const diff = Math.abs(value - startFrom);
    const duration = Math.min(700, Math.max(250, diff * 1.5));

    const tick = (ts: number) => {
      if (startTsRef.current === null) startTsRef.current = ts;
      const t = Math.min((ts - startTsRef.current) / duration, 1);
      // ease out cubic — rápido no começo, suave no final
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(startFrom + (value - startFrom) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
        setDisplay(value);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return <span className={className}>{display.toLocaleString("pt-BR")}</span>;
}
