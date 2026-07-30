import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_IN_CENTS = 100; // $1.00

/**
 * Erstellt eine PaymentIntent über $1 für ein bestimmtes Pixel.
 * Die Pixel-Koordinaten und die gewählte Farbe werden als Metadata
 * mitgeschickt, damit der Webhook später weiß, was zu tun ist.
 */
export async function createPixelPaymentIntent({ x, y, color }) {
  return stripe.paymentIntents.create({
    amount: PRICE_IN_CENTS,
    currency: 'usd',
    automatic_payment_methods: { enabled: true }, // Stripe zeigt Karte/Apple Pay/etc. automatisch
    metadata: { pixel_x: String(x), pixel_y: String(y), color }
  });
}
