# Meal Calories

A small web app for logging home-cooked meals and sizing portions by calories.

1. **Ingredients** – write down each ingredient and its weight in grams. Tap 📷 on ingredients you'll show a package photo for.
2. **Whole meal weight** – weigh the finished meal (cooking changes the weight).
3. **Calories** – tap **Copy prompt**, paste it into any AI chat (Claude, ChatGPT, …), attach the package photos there, then paste the AI's reply back and tap **Apply reply**. The AI only supplies kcal per 100 g for each ingredient; the app does the arithmetic.
4. **How much should I eat?** – enter a calorie target (or tap 300/400/500…) and the app tells you how many grams of the finished meal to eat.

Extras: every kcal/100 g value can be edited by hand; ingredients you've used before autofill their kcal/100 g; **Duplicate** copies a meal you cook often.

Data is stored in your browser (IndexedDB) – no account, no server, no API key. It's per-device: meals saved on your phone won't appear on your laptop.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

Push this folder to a GitHub repo and import it at vercel.com/new – it's a standard Next.js app, no environment variables needed. Or with the CLI:

```bash
npx vercel
```
