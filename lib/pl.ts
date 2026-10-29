/** Polish plural form: 1 składnik, 2–4 składniki, 5+ składników (12–14 → składników). */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

export const countOf = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`;

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString("pl-PL");
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
