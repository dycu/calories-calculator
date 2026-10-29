"use client";

import { useEffect, useMemo, useState } from "react";
import { gramsForKcal, ingredientKcal, mealTotals, round } from "@/lib/calc";
import { buildPrompt, parseReply } from "@/lib/prompt";
import { loadMeals, newId, newMeal, saveMeals } from "@/lib/storage";
import type { Ingredient, KcalSource, Meal } from "@/lib/types";

const num = (v: string): number | null => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export default function Home() {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    loadMeals().then(setMeals);
  }, []);

  function update(next: Meal[]) {
    setMeals(next);
    saveMeals(next);
  }

  if (!meals) return <main className="wrap"><p className="muted">Loading…</p></main>;

  const open = meals.find((m) => m.id === openId);
  if (open) {
    return (
      <MealEditor
        meal={open}
        allMeals={meals}
        onChange={(m) => update(meals.map((x) => (x.id === m.id ? m : x)))}
        onBack={() => setOpenId(null)}
        onDelete={() => {
          if (!confirm(`Delete “${open.name || "Untitled meal"}”?`)) return;
          update(meals.filter((x) => x.id !== open.id));
          setOpenId(null);
        }}
        onDuplicate={() => {
          const copy: Meal = {
            ...structuredClone(open),
            id: newId(),
            name: `${open.name || "Untitled meal"} (copy)`,
            createdAt: new Date().toISOString(),
            totalWeight: null,
            promptIds: [],
            ingredients: open.ingredients.map((i) => ({ ...i, id: newId() })),
          };
          update([copy, ...meals]);
          setOpenId(copy.id);
        }}
      />
    );
  }

  return (
    <main className="wrap">
      <header className="top">
        <h1>Meals</h1>
        <button
          className="primary"
          onClick={() => {
            const m = newMeal();
            update([m, ...meals]);
            setOpenId(m.id);
          }}
        >
          + New meal
        </button>
      </header>
      {meals.length === 0 && (
        <p className="muted empty">
          No meals yet. Add one, list its ingredients with weights, and let the AI work out the calories.
        </p>
      )}
      <ul className="meal-list">
        {meals.map((m) => {
          const t = mealTotals(m);
          return (
            <li key={m.id}>
              <button className="meal-card" onClick={() => setOpenId(m.id)}>
                <span className="meal-name">{m.name || "Untitled meal"}</span>
                <span className="muted small">
                  {new Date(m.createdAt).toLocaleDateString()} · {m.ingredients.length} ingredients
                </span>
                <span className="meal-kcal">
                  {t.totalKcal > 0 ? (
                    <>
                      <strong>{round(t.totalKcal)} kcal</strong>
                      {t.kcalPer100g && <span className="muted small"> · {round(t.kcalPer100g)} kcal/100 g</span>}
                    </>
                  ) : (
                    <span className="muted small">not calculated</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function MealEditor({
  meal,
  allMeals,
  onChange,
  onBack,
  onDelete,
  onDuplicate,
}: {
  meal: Meal;
  allMeals: Meal[];
  onChange: (m: Meal) => void;
  onBack: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState("");
  const [recheckAll, setRecheckAll] = useState(false);
  const totals = mealTotals(meal);

  // Ingredients with a known kcal/100g from earlier meals, for autocomplete.
  const library = useMemo(() => {
    const map = new Map<string, Ingredient>();
    for (const m of [...allMeals].reverse()) {
      for (const i of m.ingredients) {
        if (i.name.trim() && i.kcalPer100g != null) map.set(i.name.trim().toLowerCase(), i);
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
        { id: newId(), name: "", grams: null, kcalPer100g: null, kcalSource: null, note: "", hasPhoto: false },
      ],
    });
  }

  function fillFromLibrary(ing: Ingredient) {
    if (ing.kcalPer100g != null) return;
    const known = library.get(ing.name.trim().toLowerCase());
    if (known) {
      setIngredient(ing.id, { kcalPer100g: known.kcalPer100g, kcalSource: "saved", note: "From an earlier meal" });
    }
  }

  // Ingredients the AI should look at: those without a value, those with a package
  // photo not yet read (the label beats any estimate), or everything when re-checking.
  const toAsk = meal.ingredients.filter(
    (i) => i.name.trim() && (recheckAll || i.kcalPer100g == null || (i.hasPhoto && i.kcalSource !== "label")),
  );
  const prompt = toAsk.length ? buildPrompt(meal.name, toAsk) : "";

  async function copyPrompt() {
    setError("");
    // Remember which ingredients the numbers in the prompt refer to, so the reply maps back.
    set({ promptIds: toAsk.map((i) => i.id) });
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't access the clipboard — select the prompt text below and copy it manually.");
    }
  }

  function applyReply() {
    setError("");
    try {
      const ids = meal.promptIds?.length ? meal.promptIds : toAsk.map((i) => i.id);
      const result = parseReply(reply);
      const byId = new Map(result.ingredients.map((r) => [ids[r.n - 1], r]));
      const matched = meal.ingredients.filter((i) => byId.has(i.id)).length;
      if (matched === 0) throw new Error("None of the numbers in the reply match the prompt's ingredients.");
      onChange({
        ...meal,
        aiNotes: result.notes,
        calculatedAt: new Date().toISOString(),
        promptIds: [],
        ingredients: meal.ingredients.map((i) => {
          const r = byId.get(i.id);
          return r ? { ...i, kcalPer100g: round(r.kcalPer100g, 0.1), kcalSource: r.source, note: r.note } : i;
        }),
      });
      setReply("");
      setRecheckAll(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const targetGrams = meal.targetKcal ? gramsForKcal(totals, meal.targetKcal) : null;

  return (
    <main className="wrap">
      <header className="top">
        <button className="ghost" onClick={onBack}>← Meals</button>
        <div className="row">
          <button className="ghost" onClick={onDuplicate}>Duplicate</button>
          <button className="ghost danger" onClick={onDelete}>Delete</button>
        </div>
      </header>

      <input
        className="title-input"
        placeholder="Meal name (e.g. Chicken curry)"
        value={meal.name}
        onChange={(e) => set({ name: e.target.value })}
      />

      <section className="card">
        <h2>1. Ingredients</h2>
        <p className="muted small">
          Weigh each ingredient as it goes in. Tap 📷 if you’ll attach a photo of its nutrition label in the AI chat.
        </p>
        <datalist id="known-ingredients">
          {[...library.values()].map((i) => (
            <option key={i.id} value={i.name} />
          ))}
        </datalist>
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
        <button onClick={addIngredient}>+ Add ingredient</button>
      </section>

      <section className="card">
        <h2>2. Whole meal weight</h2>
        <p className="muted small">
          Weigh the finished meal (cooking changes the weight). Tip: weigh the pot empty first and subtract it.
        </p>
        <label className="field">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder={totals.ingredientsWeight ? String(round(totals.ingredientsWeight)) : "e.g. 1250"}
            value={meal.totalWeight ?? ""}
            onChange={(e) => set({ totalWeight: num(e.target.value) })}
          />
          <span>g</span>
        </label>
        {meal.totalWeight == null && totals.ingredientsWeight > 0 && (
          <p className="muted small">Not set — using the sum of ingredients ({round(totals.ingredientsWeight)} g).</p>
        )}
      </section>

      <section className="card">
        <h2>3. Calories</h2>
        {toAsk.length > 0 ? (
          <>
            <p className="muted small">
              Copy the prompt into your AI chat (Claude, ChatGPT…)
              {toAsk.some((i) => i.hasPhoto) && ", attach the package photos there"}, then paste its reply below.
            </p>
            <div className="row wrap-row">
              <button className="primary" onClick={copyPrompt}>
                {copied ? "Copied ✓" : `Copy prompt (${toAsk.length} ingredient${toAsk.length > 1 ? "s" : ""})`}
              </button>
            </div>
            <details className="prompt-preview">
              <summary className="small muted">Show prompt</summary>
              <textarea readOnly value={prompt} rows={10} onFocus={(e) => e.currentTarget.select()} />
            </details>
            <textarea
              className="reply"
              placeholder="Paste the AI's reply here"
              rows={4}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <div className="row wrap-row">
              <button className="primary" onClick={applyReply} disabled={!reply.trim()}>
                Apply reply
              </button>
            </div>
          </>
        ) : (
          meal.ingredients.length > 0 && (
            <p className="muted small">Every ingredient has kcal/100 g. Edit a value by hand, or re-check below.</p>
          )
        )}
        <label className="check small recheck">
          <input type="checkbox" checked={recheckAll} onChange={(e) => setRecheckAll(e.target.checked)} />
          Re-check all ingredients with the AI
        </label>
        {error && <p className="error">{error}</p>}

        {totals.totalKcal > 0 && (
          <div className="result">
            <div className="stat">
              <span className="stat-value">{round(totals.totalKcal)}</span>
              <span className="stat-label">kcal total{!totals.complete && " (incomplete)"}</span>
            </div>
            <div className="stat">
              <span className="stat-value">{totals.kcalPer100g ? round(totals.kcalPer100g) : "–"}</span>
              <span className="stat-label">kcal / 100 g of meal</span>
            </div>
            <div className="stat">
              <span className="stat-value">{round(totals.mealWeight)}</span>
              <span className="stat-label">g whole meal</span>
            </div>
          </div>
        )}
        {!totals.complete && totals.totalKcal > 0 && (
          <p className="muted small">Some ingredients are missing grams or kcal/100 g, so the total is too low.</p>
        )}
        {meal.aiNotes && <p className="notes">{meal.aiNotes}</p>}
        {meal.calculatedAt && (
          <p className="muted small">AI reply applied {new Date(meal.calculatedAt).toLocaleString()}</p>
        )}
      </section>

      <section className="card">
        <h2>4. How much should I eat?</h2>
        <label className="field">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="e.g. 500"
            value={meal.targetKcal ?? ""}
            onChange={(e) => set({ targetKcal: num(e.target.value) })}
          />
          <span>kcal</span>
        </label>
        <div className="row wrap-row">
          {[300, 400, 500, 600, 700].map((k) => (
            <button key={k} className="chip" onClick={() => set({ targetKcal: k })}>
              {k}
            </button>
          ))}
        </div>
        {meal.targetKcal != null && meal.targetKcal > 0 && (
          targetGrams ? (
            <div className="portion">
              Eat <strong>{round(targetGrams)} g</strong> of the meal
              {totals.mealWeight > 0 && (
                <span className="muted"> — {round((targetGrams / totals.mealWeight) * 100)}% of the whole meal</span>
              )}
              {targetGrams > totals.mealWeight && <p className="muted small">That’s more than the whole meal.</p>}
            </div>
          ) : (
            <p className="muted small">Calculate the calories first.</p>
          )
        )}
      </section>
    </main>
  );
}

const SOURCE_LABEL: Record<KcalSource, string> = {
  manual: "manual",
  label: "from label",
  estimate: "AI estimate",
  saved: "saved",
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
  const kcal = ingredientKcal(ing);

  return (
    <div className="ingredient">
      <div className="ing-main">
        <input
          className="ing-name"
          placeholder="Ingredient"
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
            onChange={(e) => onChange({ grams: num(e.target.value) })}
          />
          <span>g</span>
        </label>
        <button
          className={`icon photo${ing.hasPhoto ? " on" : ""}`}
          title={ing.hasPhoto ? "Package photo will be attached" : "I'll attach a package photo"}
          aria-pressed={ing.hasPhoto}
          onClick={() => onChange({ hasPhoto: !ing.hasPhoto })}
        >
          📷
        </button>
        <button className="icon" title="Remove ingredient" onClick={onRemove}>✕</button>
      </div>
      <div className="ing-meta">
        <label className="field compact">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="?"
            value={ing.kcalPer100g ?? ""}
            onChange={(e) => onChange({ kcalPer100g: num(e.target.value), kcalSource: "manual", note: "" })}
          />
          <span>kcal/100g</span>
        </label>
        {ing.kcalSource && <span className={`badge ${ing.kcalSource}`}>{SOURCE_LABEL[ing.kcalSource]}</span>}
        <span className="ing-kcal">{kcal != null ? `${round(kcal)} kcal` : ""}</span>
      </div>
      {ing.note && <p className="muted small ing-note">{ing.note}</p>}
    </div>
  );
}
