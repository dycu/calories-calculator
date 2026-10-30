"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emptyNutrients, fmt, ingredientAmount, mealTotals, missingNutrients, per100gOfMeal, round } from "@/lib/calc";
import { buildPrompt, buildRecipePrompt, parseRecipeReply, parseReply, type RecipeResult } from "@/lib/prompt";
import { deleteMeal, fetchMeals, logout, putMeal, uploadMeals } from "@/lib/api";
import {
  findPrevious,
  loadLegacyMeals,
  markLegacyUploaded,
  mealFromPrevious,
  newId,
  newMeal,
  previousMeals,
} from "@/lib/storage";
import { countOf, formatDate } from "@/lib/pl";
import { hasSummary, mealSummaryText } from "@/lib/summary";
import { NUTRIENTS, type Ingredient, type Meal, type NutrientKey, type Source } from "@/lib/types";

/** A per-100 g value in an ingredient summary: decimal comma, "?" when unknown. */
const fmtIn = (v: number | null) => (v == null ? "?" : String(v).replace(".", ","));

const num = (v: string): number | null => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

type SaveState = "saved" | "saving" | "error";

const SAVE_DELAY_MS = 800;

export default function Home() {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");

  // Edits are saved per meal, a moment after typing stops.
  const pending = useRef(new Map<string, { meal: Meal; timer: ReturnType<typeof setTimeout> }>());

  const save = useCallback((meal: Meal) => {
    setSaveState("saving");
    putMeal(meal)
      .then(() => {
        if (pending.current.size === 0) setSaveState("saved");
      })
      .catch((e: Error) => {
        setSaveState("error");
        setSaveError(e.message);
      });
  }, []);

  const flush = useCallback(() => {
    for (const { meal, timer } of pending.current.values()) {
      clearTimeout(timer);
      pending.current.delete(meal.id);
      save(meal);
    }
  }, [save]);

  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      let server = await fetchMeals();
      // One-time move of meals saved in this browser before server storage existed.
      const legacy = await loadLegacyMeals();
      if (legacy.length) {
        const known = new Set(server.map((m) => m.id));
        const missing = legacy.filter((m) => !known.has(m.id));
        if (missing.length) {
          await uploadMeals(missing);
          server = await fetchMeals();
          setNotice(`Przeniesiono ${countOf(missing.length, "posiłek", "posiłki", "posiłków")} z tego urządzenia na Twoje konto.`);
        }
        await markLegacyUploaded();
      }
      setMeals(server);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <main className="wrap">
        <p className="error">{loadError}</p>
        <button onClick={load}>Spróbuj ponownie</button>
      </main>
    );
  }
  if (!meals) return <main className="wrap"><p className="muted">Wczytywanie…</p></main>;

  function change(meal: Meal) {
    setMeals((ms) => ms!.map((x) => (x.id === meal.id ? meal : x)));
    const prev = pending.current.get(meal.id);
    if (prev) clearTimeout(prev.timer);
    setSaveState("saving");
    const timer = setTimeout(() => {
      pending.current.delete(meal.id);
      save(meal);
    }, SAVE_DELAY_MS);
    pending.current.set(meal.id, { meal, timer });
  }

  function create(meal: Meal) {
    flush();
    setMeals([meal, ...meals!]);
    save(meal);
    setPicking(false);
    setOpenId(meal.id);
  }

  async function remove(meal: Meal) {
    if (!confirm(`Usunąć „${meal.name || "Posiłek bez nazwy"}”?`)) return;
    const p = pending.current.get(meal.id);
    if (p) clearTimeout(p.timer);
    pending.current.delete(meal.id);
    try {
      await deleteMeal(meal.id);
      setMeals((ms) => ms!.filter((x) => x.id !== meal.id));
      setOpenId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  const open = meals.find((m) => m.id === openId);
  if (open) {
    return (
      <MealEditor
        meal={open}
        allMeals={meals}
        saveState={saveState}
        saveError={saveError}
        onChange={change}
        onBack={() => {
          // A meal left completely empty was opened by mistake: don't keep it in the list.
          if (!open.name.trim() && !open.description?.trim() && open.ingredients.length === 0) {
            const p = pending.current.get(open.id);
            if (p) clearTimeout(p.timer);
            pending.current.delete(open.id);
            setMeals((ms) => ms!.filter((x) => x.id !== open.id));
            deleteMeal(open.id).catch(() => {});
          } else {
            flush();
          }
          setOpenId(null);
        }}
        onDelete={() => remove(open)}
        onMakeAgain={() => create(mealFromPrevious(open))}
      />
    );
  }

  if (picking) {
    return <MealPicker meals={previousMeals(meals)} onPick={create} onCancel={() => setPicking(false)} />;
  }

  return (
    <main className="wrap">
      <header className="top">
        <h1>Posiłki</h1>
        <div className="row">
          <button
            className="ghost small"
            onClick={async () => {
              flush();
              await logout();
              window.location.href = "/login";
            }}
          >
            Wyloguj
          </button>
          <button
            className="primary"
            onClick={() => (previousMeals(meals).length ? setPicking(true) : create(newMeal()))}
          >
            + Nowy posiłek
          </button>
        </div>
      </header>
      {notice && <p className="banner small">{notice}</p>}
      {meals.length === 0 && (
        <p className="muted empty">Brak posiłków.</p>
      )}
      <ul className="meal-list">
        {meals.map((m) => {
          const t = mealTotals(m);
          return (
            <li key={m.id} className="meal-row">
              <button className="meal-card" onClick={() => setOpenId(m.id)}>
                <span className="meal-name">{m.name || "Posiłek bez nazwy"}</span>
                <span className="muted small">{formatDate(m.createdAt)}</span>
                <span className="meal-kcal">
                  {t.known.has("kcal") ? (
                    <>
                      <strong>{fmt("kcal", t.total.kcal)} kcal</strong>
                      <br />
                      <span className="muted small">{fmt("kcal", per100gOfMeal(t, "kcal") ?? 0)} kcal / 100 g</span>
                      {t.known.has("protein") && (
                        <>
                          <br />
                          <span className="muted small">
                            {fmt("protein", per100gOfMeal(t, "protein") ?? 0)} g białka / 100 g
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="muted small">nie policzono</span>
                  )}
                </span>
              </button>
              {hasSummary(m) && <CopySummaryButton meal={m} compact />}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function MealPicker({
  meals,
  onPick,
  onCancel,
}: {
  meals: Meal[];
  onPick: (m: Meal) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? meals.filter((m) => m.name.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q))
    : meals;

  return (
    <main className="wrap">
      <header className="top">
        <button className="ghost" onClick={onCancel}>← Posiłki</button>
      </header>
      <h1>Nowy posiłek</h1>
      <div className="start-buttons">
        <button className="primary" onClick={() => onPick(newMeal())}>
          Od zera
        </button>
        <button className="primary" onClick={() => onPick(newMeal())}>
          📷 Ze zdjęć
        </button>
      </div>
      <h2 className="picker-heading">Zrób ponownie</h2>
      <input
        className="search"
        type="search"
        placeholder="Szukaj"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="meal-list">
        {shown.map((m) => {
          const t = mealTotals(m);
          return (
            <li key={m.id}>
              <button className="meal-card" onClick={() => onPick(mealFromPrevious(m))}>
                <span className="meal-name">{m.name}</span>
                <span className="muted small">
                  {m.description?.trim() ||
                    m.ingredients.map((i) => i.name).filter(Boolean).join(", ")}
                </span>
                <span className="meal-kcal small muted">
                  {t.known.has("kcal") ? `${fmt("kcal", per100gOfMeal(t, "kcal") ?? 0)} kcal/100 g` : ""}
                  <br />
                  {formatDate(m.createdAt)}
                </span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <p className="muted small">Brak wyników.</p>}
      </ul>
    </main>
  );
}

function MealEditor({
  meal,
  allMeals,
  saveState,
  saveError,
  onChange,
  onBack,
  onDelete,
  onMakeAgain,
}: {
  meal: Meal;
  allMeals: Meal[];
  saveState: SaveState;
  saveError: string;
  onChange: (m: Meal) => void;
  onBack: () => void;
  onDelete: () => void;
  onMakeAgain: () => void;
}) {
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [clipFailed, setClipFailed] = useState(false);
  const [reply, setReply] = useState("");
  const [recheckAll, setRecheckAll] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const totals = mealTotals(meal);
  const previous = findPrevious(allMeals, meal);

  // Ingredients with known nutrition from earlier meals, for autocomplete.
  const library = useMemo(() => {
    const map = new Map<string, Ingredient>();
    for (const m of [...allMeals].reverse()) {
      for (const i of m.ingredients) {
        if (i.name.trim() && i.per100g.kcal != null) map.set(i.name.trim().toLowerCase(), i);
      }
    }
    return map;
  }, [allMeals]);

  const set = (patch: Partial<Meal>) => onChange({ ...meal, ...patch });
  const setIngredient = (id: string, patch: Partial<Ingredient>) =>
    set({ ingredients: meal.ingredients.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  function addIngredient() {
    set({
      ingredients: [
        ...meal.ingredients,
        {
          id: newId(),
          name: "",
          grams: null,
          per100g: emptyNutrients(),
          source: null,
          manual: [],
          note: "",
          hasPhoto: false,
        },
      ],
    });
  }

  /** Add the ingredients the AI found in the photos; fill name/notes only if still empty. */
  function applyRecipe(r: RecipeResult) {
    const added: Ingredient[] = r.ingredients.map((i) => ({
      id: newId(),
      name: i.name,
      grams: i.grams,
      gramsEstimated: i.grams != null && i.gramsEstimated,
      per100g: { ...emptyNutrients(), ...i.values },
      source: i.source,
      manual: [],
      note: i.note,
      hasPhoto: false,
    }));
    onChange({
      ...meal,
      name: meal.name.trim() ? meal.name : r.name,
      description: meal.description?.trim() ? meal.description : r.description,
      ingredients: [...meal.ingredients, ...added],
      aiNotes: r.notes,
      calculatedAt: new Date().toISOString(),
    });
    setPhotosOpen(false);
  }

  function fillFromLibrary(ing: Ingredient) {
    if (missingNutrients(ing).length === 0) return;
    const known = library.get(ing.name.trim().toLowerCase());
    if (!known) return;
    // Keep anything already typed in; fill the gaps from the earlier meal.
    const per100g = { ...ing.per100g };
    for (const { key } of NUTRIENTS) per100g[key] ??= known.per100g[key];
    setIngredient(ing.id, { per100g, source: "saved", note: "Z wcześniejszego posiłku" });
  }

  // Ingredients the AI should look at: those with missing values, those with a package
  // photo not yet read (the label beats any other source), or everything when re-checking.
  const toAsk = meal.ingredients.filter(
    (i) =>
      i.name.trim() &&
      (recheckAll ||
        missingNutrients(i).some((k) => !i.manual.includes(k)) ||
        (i.hasPhoto && i.source !== "label")),
  );
  const prompt = toAsk.length ? buildPrompt(meal.name, meal.description ?? "", toAsk) : "";

  async function copyPrompt() {
    setError("");
    // Remember which ingredients the numbers in the prompt refer to, so the reply maps back.
    set({ promptIds: toAsk.map((i) => i.id) });
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setClipFailed(true);
      setError("Brak dostępu do schowka — skopiuj prompt ręcznie.");
    }
  }

  function applyReply() {
    setError("");
    try {
      const ids = meal.promptIds?.length ? meal.promptIds : toAsk.map((i) => i.id);
      const result = parseReply(reply);
      const byId = new Map(result.ingredients.map((r) => [ids[r.n - 1], r]));
      const matched = meal.ingredients.filter((i) => byId.has(i.id)).length;
      if (matched === 0) throw new Error("Żaden numer w odpowiedzi nie pasuje do składników z promptu.");
      onChange({
        ...meal,
        aiNotes: result.notes,
        calculatedAt: new Date().toISOString(),
        promptIds: [],
        ingredients: meal.ingredients.map((i) => {
          const r = byId.get(i.id);
          if (!r) return i;
          // The AI's values replace earlier ones, except values the user typed in.
          const per100g = { ...i.per100g };
          for (const { key } of NUTRIENTS) {
            const v = r.values[key];
            if (v != null && !i.manual.includes(key)) per100g[key] = v;
          }
          return { ...i, per100g, source: r.source, note: r.note };
        }),
      });
      setReply("");
      setRecheckAll(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className="wrap">
      <header className="top">
        <button className="ghost" onClick={onBack}>← Posiłki</button>
        <span className={`save-status${saveState === "error" ? " error" : ""}`} title={saveError}>
          {saveState === "saving" ? "Zapisywanie…" : saveState === "error" ? "Nie zapisano!" : "Zapisano"}
        </span>
        <div className="row">
          <button className="ghost" onClick={onMakeAgain}>Zrób ponownie</button>
          <button className="ghost danger" onClick={onDelete}>Usuń</button>
        </div>
      </header>

      <input
        className="title-input"
        placeholder="Nazwa posiłku"
        list="previous-meals"
        value={meal.name}
        onChange={(e) => set({ name: e.target.value })}
      />
      <datalist id="previous-meals">
        {previousMeals(allMeals, meal.id).map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>
      {previous && meal.ingredients.length === 0 && (
        <div className="reuse">
          <span className="small">
            „{previous.name}” z {formatDate(previous.createdAt)}
          </span>
          <button
            className="primary"
            onClick={() => {
              const { name, description, ingredients } = mealFromPrevious(previous);
              onChange({ ...meal, name, description, ingredients });
            }}
          >
            Wczytaj składniki
          </button>
        </div>
      )}
      <textarea
        className="description"
        placeholder="Notatki (opcjonalnie)"
        rows={1}
        value={meal.description ?? ""}
        onChange={(e) => set({ description: e.target.value })}
      />

      <section className="card">
        <h2>Składniki</h2>
        <datalist id="known-ingredients">
          {[...library.values()].map((i) => (
            <option key={i.id} value={i.name} />
          ))}
        </datalist>
        {(meal.ingredients.length === 0 || photosOpen) && (
          <PhotoRecipe meal={meal} onApply={applyRecipe} onClose={meal.ingredients.length ? () => setPhotosOpen(false) : undefined} />
        )}
        <div className="ingredients">
          {meal.ingredients.map((ing) => (
            <IngredientRow
              key={ing.id}
              ing={ing}
              onChange={(p) => setIngredient(ing.id, p)}
              onBlurName={() => fillFromLibrary(ing)}
              onRemove={() => set({ ingredients: meal.ingredients.filter((i) => i.id !== ing.id) })}
            />
          ))}
        </div>
        <div className="row wrap-row">
          <button onClick={addIngredient}>+ Składnik</button>
          {meal.ingredients.length > 0 && !photosOpen && (
            <button onClick={() => setPhotosOpen(true)}>📷 Ze zdjęć</button>
          )}
        </div>
      </section>

      <section className="card">
        <h2>Waga gotowego posiłku</h2>
        <label className="field">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder={totals.ingredientsWeight ? String(round(totals.ingredientsWeight)) : "np. 1250"}
            value={meal.totalWeight ?? ""}
            onChange={(e) => set({ totalWeight: num(e.target.value) })}
          />
          <span>g</span>
        </label>
      </section>

      {meal.ingredients.length > 0 && (
      <section className="card">
        <h2>Wartości odżywcze</h2>
        {toAsk.length > 0 && (
          <>
            <div className="row wrap-row">
              <button className="primary" onClick={copyPrompt}>
                {copied ? "Skopiowano ✓" : `Kopiuj prompt (${toAsk.length})`}
              </button>
            </div>
            {clipFailed && (
              <textarea readOnly value={prompt} rows={8} onFocus={(e) => e.currentTarget.select()} />
            )}
            <textarea
              className="reply"
              placeholder="Wklej odpowiedź AI"
              rows={3}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <div className="row wrap-row">
              <button className="primary" onClick={applyReply} disabled={!reply.trim()}>
                Zastosuj odpowiedź
              </button>
            </div>
          </>
        )}
        {meal.ingredients.length > 0 && (
          <label className="check small recheck">
            <input type="checkbox" checked={recheckAll} onChange={(e) => setRecheckAll(e.target.checked)} />
            Sprawdź wszystkie ponownie
          </label>
        )}
        {error && <p className="error">{error}</p>}

        {totals.known.size > 0 && (
          <>
            <table className="nutrition">
              <thead>
                <tr>
                  <th />
                  <th>
                    Cały posiłek
                    <br />
                    {round(totals.mealWeight)} g
                  </th>
                  <th>
                    Na
                    <br />
                    100 g
                  </th>
                </tr>
              </thead>
              <tbody>
                {NUTRIENTS.map((n) => {
                  const per100 = per100gOfMeal(totals, n.key);
                  const star = totals.incomplete.has(n.key) && totals.known.has(n.key) ? "*" : "";
                  return (
                    <tr key={n.key} className={"sub" in n ? "sub" : ""}>
                      <th scope="row">{n.label}</th>
                      <td>{per100 == null ? "–" : `${fmt(n.key, totals.total[n.key])} ${n.unit}${star}`}</td>
                      <td>{per100 == null ? "–" : `${fmt(n.key, per100)} ${n.unit}${star}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {[...totals.incomplete].some((k) => totals.known.has(k)) && (
              <p className="muted small">* niepełne dane</p>
            )}
            <div className="row wrap-row">
              <CopySummaryButton meal={meal} label="📋 Kopiuj tabelę" />
            </div>
          </>
        )}
        {meal.aiNotes && <p className="notes">{meal.aiNotes}</p>}
      </section>
      )}
    </main>
  );
}

const SOURCE_LABEL: Record<Source, string> = {
  label: "z etykiety",
  web: "z internetu",
  estimate: "szacunek AI",
  saved: "zapisane",
};

function IngredientRow({
  ing,
  onChange,
  onBlurName,
  onRemove,
}: {
  ing: Ingredient;
  onChange: (patch: Partial<Ingredient>) => void;
  onBlurName: () => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const kcal = ingredientAmount(ing, "kcal");
  const missing = missingNutrients(ing).length;

  function setValue(key: NutrientKey, value: number | null) {
    const manual = ing.manual.filter((k) => k !== key);
    onChange({ per100g: { ...ing.per100g, [key]: value }, manual: value == null ? manual : [...manual, key] });
  }

  const input = (key: NutrientKey) => (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      placeholder="?"
      value={ing.per100g[key] ?? ""}
      onChange={(e) => setValue(key, num(e.target.value))}
    />
  );

  return (
    <div className="ingredient">
      <div className="ing-main">
        <input
          className="ing-name"
          placeholder="Składnik"
          list="known-ingredients"
          value={ing.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={onBlurName}
        />
        <label className="field compact">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="0"
            value={ing.grams ?? ""}
            onChange={(e) => onChange({ grams: num(e.target.value), gramsEstimated: false })}
          />
          <span>g</span>
        </label>
        <button
          className={`icon photo${ing.hasPhoto ? " on" : ""}`}
          title={ing.hasPhoto ? "Zdjęcie opakowania zostanie dołączone" : "Dołączę zdjęcie opakowania"}
          aria-pressed={ing.hasPhoto}
          onClick={() => onChange({ hasPhoto: !ing.hasPhoto })}
        >
          📷
        </button>
        <button className="icon" title="Usuń składnik" onClick={onRemove}>✕</button>
      </div>
      <div className="ing-meta">
        <label className="field compact">
          {input("kcal")}
          <span>kcal/100g</span>
        </label>
        {ing.source && <span className={`badge ${ing.source}`}>{SOURCE_LABEL[ing.source]}</span>}
        {ing.gramsEstimated && (
          <span className="badge estimate" title="Odgadnięte ze zdjęcia — zważ i popraw gramy">
            ≈ waga
          </span>
        )}
        <span className="ing-kcal">{kcal != null ? `${round(kcal)} kcal` : ""}</span>
      </div>
      <button className="link small" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        {expanded ? "▾" : "▸"}{" "}
        {ing.per100g.protein != null || ing.per100g.fat != null || ing.per100g.carbs != null
          ? `B ${fmtIn(ing.per100g.protein)} · T ${fmtIn(ing.per100g.fat)} · W ${fmtIn(ing.per100g.carbs)}`
          : "Wartości na 100 g"}
        {missing > 0 && <span className="muted"> · brak {missing}</span>}
      </button>
      {expanded && (
        <div className="nutrient-grid">
          {NUTRIENTS.filter((n) => n.key !== "kcal").map((n) => (
            <label key={n.key} className={`field compact${"sub" in n ? " sub" : ""}`}>
              <span className="nutrient-label">{n.label}</span>
              {input(n.key)}
              <span>{n.unit}</span>
            </label>
          ))}
        </div>
      )}
      {expanded && ing.note && <p className="muted small ing-note">{ing.note}</p>}
    </div>
  );
}

function PhotoRecipe({
  meal,
  onApply,
  onClose,
}: {
  meal: Meal;
  onApply: (r: RecipeResult) => void;
  onClose?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [clipFailed, setClipFailed] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const prompt = buildRecipePrompt(meal.name, meal.description ?? "");

  async function copy() {
    setError("");
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setClipFailed(true);
      setError("Brak dostępu do schowka — skopiuj prompt ręcznie.");
    }
  }

  function apply() {
    setError("");
    try {
      onApply(parseRecipeReply(reply));
      setReply("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="photo-recipe">
      <div className="row photo-recipe-head">
        <strong>📷 Ze zdjęć</strong>
        {onClose && <button className="ghost small" onClick={onClose}>Zamknij</button>}
      </div>
      <div className="row wrap-row">
        <button className="primary" onClick={copy}>{copied ? "Skopiowano ✓" : "Kopiuj prompt"}</button>
      </div>
      {clipFailed && <textarea readOnly value={prompt} rows={8} onFocus={(e) => e.currentTarget.select()} />}
      <textarea
        className="reply"
        placeholder="Wklej odpowiedź AI"
        rows={3}
        value={reply}
        onChange={(e) => setReply(e.target.value)}
      />
      <div className="row wrap-row">
        <button className="primary" onClick={apply} disabled={!reply.trim()}>
          Dodaj składniki
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Copies the meal's nutrition table + total weight as text; shows the text if the clipboard is blocked. */
function CopySummaryButton({ meal, label, compact }: { meal: Meal; label?: string; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const text = mealSummaryText(meal);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("failed");
    }
  }

  return (
    <>
      {compact ? (
        <button
          className="copy-icon"
          title="Kopiuj tabelę i wagę całości"
          aria-label={`Kopiuj tabelę i wagę: ${meal.name || "posiłek bez nazwy"}`}
          onClick={copy}
        >
          {state === "copied" ? "✓" : "📋"}
        </button>
      ) : (
        <button onClick={copy}>{state === "copied" ? "Skopiowano ✓" : label}</button>
      )}
      {state === "failed" && (
        <div className="copy-fallback">
          <p className="error small">Brak dostępu do schowka — zaznacz tekst i skopiuj ręcznie:</p>
          <textarea readOnly value={text} rows={11} onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </>
  );
}
