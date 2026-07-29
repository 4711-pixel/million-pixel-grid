import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  getPixelsInRegion,
  reservePixel,
  attachPaymentIntent,
  markPixelSold,
  releaseExpiredReservations,
  getStats
} from './db.js';
import { stripe, createPixelPaymentIntent } from './stripe.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// Stripe-Webhook braucht den ROHEN Body (vor express.json()!), deshalb eigene Route zuerst.
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook-Signatur ungültig:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const color = pi.metadata.color;
    try {
      const result = await markPixelSold(pi.id, color);
      if (!result) {
        console.warn('Kein passendes Pixel für PaymentIntent gefunden:', pi.id);
      } else {
        console.log(`Pixel (${result.x}, ${result.y}) verkauft, Farbe ${color}`);
      }
    } catch (err) {
      console.error('Fehler beim Finalisieren des Pixel-Kaufs:', err);
      return res.status(500).send('Internal error');
    }
  }

  res.json({ received: true });
});

app.use(express.json());

// Pixel für einen sichtbaren Ausschnitt abfragen (fürs Grid-Rendering)
app.get('/api/pixels', async (req, res) => {
  const x0 = Number(req.query.x0 ?? 0);
  const y0 = Number(req.query.y0 ?? 0);
  const x1 = Number(req.query.x1 ?? 1000);
  const y1 = Number(req.query.y1 ?? 1000);

  if ([x0, y0, x1, y1].some(Number.isNaN) || x1 - x0 > 1000 || y1 - y0 > 1000) {
    return res.status(400).json({ error: 'Ungültiger oder zu großer Bereich (max. 1000x1000).' });
  }

  const pixels = await getPixelsInRegion(x0, y0, x1, y1);
  res.json({ pixels });
});

app.get('/api/stats', async (req, res) => {
  res.json(await getStats());
});

// Schritt 1: Pixel reservieren + PaymentIntent erstellen
app.post('/api/pixels/:x/:y/checkout', async (req, res) => {
  const x = Number(req.params.x);
  const y = Number(req.params.y);
  const { color } = req.body;

  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= 1000 || y < 0 || y >= 1000) {
    return res.status(400).json({ error: 'Ungültige Koordinaten.' });
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(color || '')) {
    return res.status(400).json({ error: 'Ungültige Farbe (erwartet #RRGGBB).' });
  }

  const reservation = await reservePixel(x, y);
  if (!reservation) {
    return res.status(409).json({ error: 'Dieses Pixel ist bereits vergeben oder gerade reserviert.' });
  }

  try {
    const paymentIntent = await createPixelPaymentIntent({ x, y, color });
    await attachPaymentIntent(x, y, paymentIntent.id);
    res.json({
      clientSecret: paymentIntent.client_secret,
      reservedForMinutes: reservation.reservedForMinutes
    });
  } catch (err) {
    console.error('Stripe-Fehler:', err);
    res.status(500).json({ error: 'Zahlung konnte nicht vorbereitet werden.' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend läuft auf Port ${PORT}`);
});

// Alle 60 Sekunden abgelaufene Reservierungen freigeben
setInterval(async () => {
  try {
    const released = await releaseExpiredReservations();
    if (released > 0) console.log(`${released} abgelaufene Reservierung(en) freigegeben.`);
  } catch (err) {
    console.error('Fehler beim Aufräumen abgelaufener Reservierungen:', err);
  }
}, 60_000);
