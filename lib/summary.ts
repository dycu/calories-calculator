import { fmt, mealTotals, per100gOfMeal, round } from "./calc";
import { formatDate } from "./pl";
import { NUTRIENTS, type Meal } from "./types";

/**
 * The meal's nutrition table and total weight as plain text, for pasting into
 * an AI chat that tracks the day's eating outside the app.
 */
export function mealSummaryText(meal: Meal): string {
  const t = mealTotals(meal);
  const weight =
    meal.totalWeight != null
      ? `${round(meal.totalWeight)} g`
      : `${round(t.ingredientsWeight)} g (suma składników — gotowy posiłek nie był ważony)`;

  const rows = NUTRIENTS.filter((n) => t.known.has(n.key)).map((n) => {
    const star = t.incomplete.has(n.key) ? " *" : "";
    return `- ${n.label}: ${fmt(n.key, t.total[n.key])} ${n.unit} | ${fmt(n.key, per100gOfMeal(t, n.key) ?? 0)} ${n.unit}${star}`;
  });

  return [
    `Posiłek: ${meal.name.trim() || "bez nazwy"} (${formatDate(meal.createdAt)})`,
    `Waga całego posiłku: ${weight}`,
    "",
    "Wartości odżywcze (cały posiłek | na 100 g):",
    ...rows,
    ...(rows.some((r) => r.endsWith("*")) ? ["", "* zaniżone — części składników brakuje wagi lub tej wartości"] : []),
  ].join("\n");
}

/** Whether the meal has any nutrition values worth copying. */
export const hasSummary = (meal: Meal) => mealTotals(meal).known.size > 0;
