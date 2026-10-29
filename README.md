# Kalorie posiłków

Aplikacja do zapisywania domowych posiłków i ich pełnych wartości odżywczych: wartość energetyczna, tłuszcz, kwasy nasycone, węglowodany, cukry, błonnik, białko i sól.

1. **Składniki** – wpisz każdy składnik i jego wagę w gramach. Stuknij 📷 przy składnikach, których zdjęcie etykiety dołączysz w czacie z AI. Znane wartości możesz wpisać ręcznie w „Wartości na 100 g” – AI nigdy ich nie nadpisuje.
2. **Waga całego posiłku** – zważ gotowy posiłek (gotowanie zmienia wagę).
3. **Wartości odżywcze** – stuknij **Kopiuj prompt**, wklej go do czatu z AI z wyszukiwaniem w sieci (Claude, ChatGPT…), dołącz zdjęcia opakowań, a potem wklej odpowiedź i stuknij **Zastosuj odpowiedź**. Etykiety AI odczytuje ze zdjęć, resztę wyszukuje w internecie (strony producentów i sklepów, tabele składu żywności NIZP PZH / IŻŻ). AI podaje tylko wartości na 100 g; sumy dla całego posiłku i na 100 g liczy aplikacja.

**Posiłek ze zdjęć:** w nowym posiłku (albo przyciskiem **📷 Dodaj ze zdjęć**) skopiuj prompt do czatu z AI i dołącz zdjęcia składników – opakowań, wyświetlacza wagi albo wszystkiego na blacie. Po wklejeniu odpowiedzi składniki dodają się z wagami i wartościami odżywczymi. Wagi, których AI nie odczytało z wagi kuchennej, są oznaczone „≈ waga szacowana”, dopóki nie wpiszesz prawdziwej.

**Ponowne robienie posiłku:** stuknij **+ Nowy posiłek** i wybierz wcześniejszy posiłek, wpisz nazwę wcześniejszego posiłku i stuknij **Użyj ponownie** albo stuknij **Zrób ponownie** w otwartym posiłku. Kopiują się notatki, składniki, wagi i wartości odżywcze – popraw wagi i zważ gotowy posiłek.

**Kopiowanie do AI:** przycisk **📋 Kopiuj ostatni posiłek** na ekranie głównym (i **📋 Kopiuj tabelę i wagę** w każdym posiłku) kopiuje tabelę wartości odżywczych – dla całego posiłku i na 100 g – razem z wagą całości, jako zwykły tekst do wklejenia w czacie z AI.

Aplikacja jest chroniona hasłem, a posiłki są zapisywane na serwerze w bazie Upstash Redis, więc są takie same na każdym urządzeniu.

## Uruchomienie lokalne

Skopiuj `.env.example` do `.env.local` i uzupełnij, a potem:

```bash
npm install
npm run dev
```

## Wdrożenie na Vercel

1. Zaimportuj repozytorium na vercel.com/new (zwykła aplikacja Next.js).
2. Podłącz bazę Upstash Redis: w zakładce **Storage** projektu albo zakładając bazę na console.upstash.com i dodając `UPSTASH_REDIS_REST_URL` oraz `UPSTASH_REDIS_REST_TOKEN`. Baza może być współdzielona z innym projektem – dane tej aplikacji są pod kluczem `calories-calculator:meals`.
3. W **Settings → Environment Variables** dodaj `APP_PASSWORD`.
4. Zrób **Redeploy**, żeby nowe zmienne zaczęły działać.
