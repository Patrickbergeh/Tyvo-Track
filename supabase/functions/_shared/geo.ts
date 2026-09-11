// Checks the format only; IP geolocation does not establish a visitor's address.
export function normalizePostal(value: unknown, country: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toUpperCase();
  const cc = typeof country === "string" ? country.trim().toLowerCase() : "";
  if (["br", "bra", "brazil", "brasil"].includes(cc)) {
    // Never pad incomplete provider results with guessed leading/trailing zeros.
    return /^\d{5}-?\d{3}$/.test(raw) ? raw.replace("-", "") : null;
  }
  // International postal codes may include letters, spaces and hyphens.
  return /^[A-Z0-9][A-Z0-9 -]{1,14}[A-Z0-9]$/.test(raw) ? raw : null;
}

export function formatPostal(value: unknown, country: unknown): string | null {
  const postal = normalizePostal(value, country);
  const cc = typeof country === "string" ? country.trim().toLowerCase() : "";
  return postal && ["br", "bra", "brazil", "brasil"].includes(cc)
    ? `${postal.slice(0, 5)}-${postal.slice(5)}` : postal;
}
