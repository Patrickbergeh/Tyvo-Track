// Normaliza o nome do estado para exibição: remove prefixos do tipo
// "State of", "Estado de/do/da", "Province of", "Região de"…, converte
// siglas brasileiras para o nome completo e aplica capitalização.

const BR_STATE_CODES: Record<string, string> = {
  ac: "Acre", al: "Alagoas", ap: "Amapá", am: "Amazonas", ba: "Bahia",
  ce: "Ceará", df: "Distrito Federal", es: "Espírito Santo", go: "Goiás",
  ma: "Maranhão", mt: "Mato Grosso", ms: "Mato Grosso do Sul", mg: "Minas Gerais",
  pa: "Pará", pb: "Paraíba", pr: "Paraná", pe: "Pernambuco", pi: "Piauí",
  rj: "Rio de Janeiro", rn: "Rio Grande do Norte", rs: "Rio Grande do Sul",
  ro: "Rondônia", rr: "Roraima", sc: "Santa Catarina", sp: "São Paulo",
  se: "Sergipe", to: "Tocantins",
};

const PREFIX = /^(state of|estado d[aeo]s?|province of|provincia d[aeo]|região d[aeo]|regiao d[aeo]|region of|departamento d[aeo]|prefecture of)\s+/i;

export function cleanState(raw: string | null | undefined): string {
  if (!raw) return "—";
  let s = String(raw).trim();
  // tira o prefixo (ex.: "State of São Paulo" → "São Paulo")
  s = s.replace(PREFIX, "").trim();
  if (!s) return "—";

  const key = s.toLowerCase().replace(/\s+/g, " ").trim();
  if (BR_STATE_CODES[key]) return BR_STATE_CODES[key];

  // title-case correto: maiusculiza só a 1ª letra de cada palavra (e após hífen/
  // apóstrofo). Conectores (de/do/da/dos/das/e) ficam minúsculos, exceto no início.
  // Evita o bug do \b com acentos ("ceará" → "Ceará", "são paulo" → "São Paulo").
  const MINOR = new Set(["de", "do", "da", "dos", "das", "e", "di", "du"]);
  return key
    .split(" ")
    .map((word, i) =>
      i > 0 && MINOR.has(word)
        ? word
        : word.replace(/(^|[-'’])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase())
    )
    .join(" ");
}
