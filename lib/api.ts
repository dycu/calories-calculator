import { normalizeMeal } from "./storage";
import type { Meal } from "./types";

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Nie zalogowano.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Błąd serwera (${res.status}).`);
  return data as T;
}

export const fetchMeals = () => call<{ meals: unknown[] }>("/api/meals").then((d) => d.meals.map(normalizeMeal));

export const uploadMeals = (meals: Meal[]) =>
  call("/api/meals", { method: "POST", body: JSON.stringify({ meals }) });

// keepalive lets a save started as the page closes still reach the server.
export const putMeal = (meal: Meal) =>
  call(`/api/meals/${meal.id}`, { method: "PUT", body: JSON.stringify(meal), keepalive: true });

export const deleteMeal = (id: string) => call(`/api/meals/${id}`, { method: "DELETE" });

export const logout = () => call("/api/logout", { method: "POST" });
