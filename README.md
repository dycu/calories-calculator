# Meal Calories

A small web app for logging home-cooked meals and sizing portions by calories.

1. **Ingredients** – write down each ingredient and its weight in grams. Tap 📷 on ingredients you'll show a package photo for.
2. **Whole meal weight** – weigh the finished meal (cooking changes the weight).
3. **Calories** – tap **Copy prompt**, paste it into any AI chat (Claude, ChatGPT, …), attach the package photos there, then paste the AI's reply back and tap **Apply reply**. The AI only supplies kcal per 100 g for each ingredient; the app does the arithmetic.
4. **How much should I eat?** – enter a calorie target (or tap 300/400/500…) and the app tells you how many grams of the finished meal to eat.

**Making a meal again:** tap **+ New meal** and pick one you've made before (searchable), type the name of a previous meal and tap **Reuse it**, or tap **Make again** on an open meal. Its recipe notes, ingredients, weights and kcal/100 g are copied – adjust the weights if they changed and weigh the finished meal; no need to ask the AI again.

Extras: every kcal/100 g value can be edited by hand; ingredients you've used before autofill their kcal/100 g; optional recipe notes per meal are saved and included in the AI prompt.

The app is behind a simple password login, and meals are stored on the server in an Upstash Redis database, so they're the same on every device. Meals saved in a browser by the earlier browser-only version are uploaded automatically the first time you log in there.

## Run locally

Copy `.env.example` to `.env.local` and fill it in (database values come from the Vercel Storage tab), then:

```bash
npm install
npm run dev
```

## Deploy to Vercel

1. Import the repo at vercel.com/new (standard Next.js app).
2. In the project's **Storage** tab, create an **Upstash → Redis** database (free plan) and connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. In **Settings → Environment Variables**, add `APP_PASSWORD`.
4. Redeploy so the new variables take effect.
