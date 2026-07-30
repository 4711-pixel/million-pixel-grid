# The Million Pixel Grid

Ein 1000×1000-Pixel-Grid, auf dem jeder Nutzer ein Pixel für $1 kaufen
und dessen Farbe bestimmen kann. Zahlung über Stripe (Karte, Apple Pay,
Google Pay, optional PayPal — alles über ein einziges Payment Element).

## Projektstruktur

```
backend/    Node/Express-API + Postgres + Stripe-Webhook
frontend/   React + Vite, Canvas-Grid mit Zoom/Pan
```

## 1. Lokal zum Laufen bringen

### Voraussetzungen
- Node.js 18+
- Eine Postgres-Datenbank (lokal via Docker, oder direkt bei einem Hoster wie Render/Supabase)
- Ein Stripe-Konto (kostenlos, Test-Modus reicht zum Start)
- Die [Stripe CLI](https://stripe.com/docs/stripe-cli) zum lokalen Testen von Webhooks

### Backend

```bash
cd backend
cp .env.example .env
# .env ausfüllen: DATABASE_URL, STRIPE_SECRET_KEY
npm install
npm run migrate   # legt die Tabelle "pixels" an
npm run dev        # startet auf Port 3001
```

Stripe-Webhook lokal weiterleiten (in einem zweiten Terminal):

```bash
stripe listen --forward-to localhost:3001/webhooks/stripe
```

Das gibt dir ein `whsec_...` Secret aus — das trägst du in `backend/.env`
als `STRIPE_WEBHOOK_SECRET` ein.

### Frontend

```bash
cd frontend
cp .env.example .env
# .env ausfüllen: VITE_STRIPE_PUBLISHABLE_KEY (aus dem Stripe Dashboard)
npm install
npm run dev   # startet auf Port 5173
```

Öffne http://localhost:5173 — fertig, lokal läuft alles.

## 2. Stripe einrichten

1. Konto auf [stripe.com](https://stripe.com) erstellen
2. Im Dashboard unter **Developers → API keys**: den `Publishable key`
   (für's Frontend) und `Secret key` (für's Backend) kopieren
3. Unter **Settings → Payment methods**: Apple Pay, Google Pay sind i.d.R.
   automatisch an; PayPal muss dort separat aktiviert werden (Stripe
   prüft dafür kurz euer PayPal-Geschäftskonto)
4. Für Apple Pay im Live-Betrieb: unter **Settings → Payment methods →
   Apple Pay** eure Domain verifizieren (Datei-Upload, macht Stripe
   automatisch, wenn ihr über Vercel/Render deployed)
5. Wenn alles läuft: im Dashboard oben rechts von **Test-Modus** auf
   **Live-Modus** wechseln und die Live-Keys in die Produktionsumgebung
   eintragen

## 3. Deployment

### Datenbank + Backend auf Render

1. Auf [render.com](https://render.com) einen **PostgreSQL**-Dienst anlegen
   → die `Internal Database URL` kopieren
2. Einen **Web Service** anlegen, verbunden mit eurem Git-Repo,
   Root-Verzeichnis `backend/`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variables: `DATABASE_URL`, `STRIPE_SECRET_KEY`,
     `STRIPE_WEBHOOK_SECRET`, `FRONTEND_URL` (eure Vercel-URL)
3. Nach dem ersten Deploy einmalig die Migration laufen lassen
   (Render "Shell" Tab): `npm run migrate`
4. Im Stripe Dashboard unter **Developers → Webhooks** einen Endpoint
   auf `https://euer-backend.onrender.com/webhooks/stripe` anlegen,
   Event `payment_intent.succeeded` abonnieren, das Signing Secret
   kopieren → als `STRIPE_WEBHOOK_SECRET` in Render eintragen

### Frontend auf Vercel

1. Repo auf [vercel.com](https://vercel.com) importieren, Root-Verzeichnis
   `frontend/`
2. Environment Variables setzen: `VITE_API_URL` (eure Render-Backend-URL),
   `VITE_STRIPE_PUBLISHABLE_KEY`
3. Deploy — fertig

## 4. Wichtige Design-Entscheidungen

- **Keine 1 Million Zeilen von Anfang an:** Nur reservierte/verkaufte
  Pixel bekommen eine DB-Zeile. Alles andere gilt implizit als frei.
  Das hält die Datenbank klein und schnell.
- **Reservierung statt Race Conditions:** Beim Klick auf ein Pixel wird
  es per `SELECT ... FOR UPDATE` innerhalb einer Transaktion für 10
  Minuten gesperrt. Ein zweiter Nutzer kann es in dieser Zeit nicht
  gleichzeitig kaufen.
- **Zahlung bestätigt über Webhook, nicht über den Frontend-Response:**
  Ein Pixel wird erst final als "verkauft" markiert, wenn Stripe per
  Webhook `payment_intent.succeeded` meldet — nicht schon, wenn der
  Browser "Erfolg" zeigt. Das verhindert, dass Leute durch Abbrechen im
  letzten Moment ein Pixel bekommen, ohne bezahlt zu haben.
- **Aufräum-Job:** Alle 60 Sekunden werden abgelaufene, nie bezahlte
  Reservierungen gelöscht, damit das Pixel wieder frei wird.

## 5. Was für den echten Produktivbetrieb noch fehlt

- **Rechtliches (Pflicht in Deutschland/EU):** Impressum,
  Datenschutzerklärung (DSGVO), ggf. Umsatzsteuer-Ausweis, AGB
- **Moderation:** Es gibt aktuell keine Kontrolle darüber, welche
  Farbmuster entstehen — bei Missbrauch (z. B. anstößige Pixel-Bilder)
  braucht ihr eine Möglichkeit, einzelne Pixel zu sperren/zurückzusetzen
- **Rate Limiting:** Die Checkout-Route sollte gegen Spam/Bots
  abgesichert werden (z. B. mit `express-rate-limit`)
- **Monitoring:** Fehler-Tracking (z. B. Sentry) für Backend und Frontend
- **Bilder/Vorschau:** Ein Screenshot-/Thumbnail-Mechanismus, damit das
  Grid auch bei Social-Media-Shares gut aussieht
