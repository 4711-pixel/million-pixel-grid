import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const RESERVATION_MINUTES = 10;

/**
 * Liefert alle Pixel in einem Rechteck (für das Frontend-Grid-Rendering).
 * Nur reservierte/verkaufte Pixel kommen zurück – der Rest ist implizit frei.
 */
export async function getPixelsInRegion(x0, y0, x1, y1) {
  const { rows } = await pool.query(
    `SELECT x, y, color, status, reserved_until
     FROM pixels
     WHERE x >= $1 AND x < $2 AND y >= $3 AND y < $4
       AND (status = 'sold' OR (status = 'reserved' AND reserved_until > now()))`,
    [x0, x1, y0, y1]
  );
  return rows;
}

/**
 * Versucht, ein Pixel zu reservieren. Schlägt fehl, wenn es bereits
 * verkauft oder aktiv (nicht abgelaufen) reserviert ist.
 * Gibt die Reservierung zurück oder null bei Konflikt.
 */
export async function reservePixel(x, y) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT x, y, status, reserved_until FROM pixels WHERE x = $1 AND y = $2 FOR UPDATE`,
      [x, y]
    );

    if (rows.length > 0) {
      const existing = rows[0];
      const stillReserved = existing.status === 'reserved' && existing.reserved_until > new Date();
      if (existing.status === 'sold' || stillReserved) {
        await client.query('ROLLBACK');
        return null; // nicht verfügbar
      }
      // abgelaufene Reservierung -> überschreiben
      await client.query(
        `UPDATE pixels SET status = 'reserved', reserved_until = now() + interval '${RESERVATION_MINUTES} minutes',
         payment_intent_id = NULL, updated_at = now() WHERE x = $1 AND y = $2`,
        [x, y]
      );
    } else {
      await client.query(
        `INSERT INTO pixels (x, y, status, reserved_until)
         VALUES ($1, $2, 'reserved', now() + interval '${RESERVATION_MINUTES} minutes')`,
        [x, y]
      );
    }

    await client.query('COMMIT');
    return { x, y, reservedForMinutes: RESERVATION_MINUTES };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function attachPaymentIntent(x, y, paymentIntentId) {
  await pool.query(
    `UPDATE pixels SET payment_intent_id = $3, updated_at = now() WHERE x = $1 AND y = $2`,
    [x, y, paymentIntentId]
  );
}

/**
 * Wird vom Stripe-Webhook aufgerufen, wenn eine Zahlung bestätigt ist.
 * Setzt das Pixel final auf 'sold' und speichert die Farbe.
 */
export async function markPixelSold(paymentIntentId, color) {
  const { rows } = await pool.query(
    `UPDATE pixels SET status = 'sold', color = $2, reserved_until = NULL, updated_at = now()
     WHERE payment_intent_id = $1
     RETURNING x, y`,
    [paymentIntentId, color]
  );
  return rows[0] || null;
}

export async function releaseExpiredReservations() {
  const { rowCount } = await pool.query(
    `DELETE FROM pixels WHERE status = 'reserved' AND reserved_until < now()`
  );
  return rowCount;
}

export async function getStats() {
  const { rows } = await pool.query(
    `SELECT count(*) FILTER (WHERE status = 'sold') AS sold FROM pixels`
  );
  return { sold: Number(rows[0].sold), total: 1_000_000 };
}
