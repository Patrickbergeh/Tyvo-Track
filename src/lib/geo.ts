// Normaliza o nome do estado para exibição. Regra única que cobre os 27 estados
// brasileiros independentemente de como o dado chegou: sigla (sp, df…), nome em
// português (com ou sem acento, em qualquer caixa) ou variação em inglês que os
// provedores de geo devolvem (ex.: "Federal District", "State of São Paulo").
// Estados estrangeiros caem no fallback de title-case (com acentos corretos).

// Fonte da verdade: sigla → nome oficial PT-BR
const UF: Record<string, string> = {
  ac: "Acre", al: "Alagoas", ap: "Amapá", am: "Amazonas", ba: "Bahia",
  ce: "Ceará", df: "Distrito Federal", es: "Espírito Santo", go: "Goiás",
  ma: "Maranhão", mt: "Mato Grosso", ms: "Mato Grosso do Sul", mg: "Minas Gerais",
  pa: "Pará", pb: "Paraíba", pr: "Paraná", pe: "Pernambuco", pi: "Piauí",
  rj: "Rio de Janeiro", rn: "Rio Grande do Norte", rs: "Rio Grande do Sul",
  ro: "Rondônia", rr: "Roraima", sc: "Santa Catarina", sp: "São Paulo",
  se: "Sergipe", to: "Tocantins",
};

// Variações em inglês (geo APIs) → sigla
const EN_ALIASES: Record<string, string> = {
  "federal district": "df",
};

// remove acentos + caixa baixa + espaços colapsados (para o lookup)
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// índice: nome PT normalizado (sem acento) → sigla
const NAME_TO_CODE: Record<string, string> = {};
for (const [code, name] of Object.entries(UF)) {
  NAME_TO_CODE[norm(name)] = code;
}

// remove prefixos do tipo "State of", "Estado de/do/da", "Province of"…
const PREFIX = /^(state of|estado d[aeo]s?|province of|provincia d[aeo]|região d[aeo]|regiao d[aeo]|region of|departamento d[aeo]|prefecture of)\s+/i;

// conectores que ficam minúsculos no title-case (exceto no início)
const MINOR = new Set(["de", "do", "da", "dos", "das", "e", "di", "du"]);

function titleCase(lower: string): string {
  return lower
    .split(" ")
    .map((w, i) =>
      i > 0 && MINOR.has(w)
        ? w
        : w.replace(/(^|[-'’])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase())
    )
    .join(" ");
}

export function cleanState(raw: string | null | undefined): string {
  if (!raw) return "—";
  const s = String(raw).trim().replace(PREFIX, "").trim();
  if (!s) return "—";

  const n = norm(s); // chave de lookup, sem acento

  if (UF[n]) return UF[n];                       // sigla (sp, df…)
  if (EN_ALIASES[n]) return UF[EN_ALIASES[n]];   // inglês (federal district…)
  if (NAME_TO_CODE[n]) return UF[NAME_TO_CODE[n]]; // nome PT com/sem acento

  // estrangeiro / desconhecido → title-case preservando acentos
  return titleCase(s.toLowerCase().replace(/\s+/g, " ").trim());
}
