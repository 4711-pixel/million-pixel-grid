-- Nur Pixel, die reserviert oder verkauft sind, bekommen eine Zeile.
-- Alle anderen der 1.000.000 Positionen gelten implizit als frei.
-- x, y jeweils 0..999 (Grid 1000x1000)

CREATE TABLE IF NOT EXISTS pixels (
  x SMALLINT NOT NULL,
  y SMALLINT NOT NULL,
  color CHAR(7),                        -- z.B. '#D97757', erst gesetzt wenn verkauft
  status TEXT NOT NULL DEFAULT 'reserved', -- 'reserved' | 'sold'
  payment_intent_id TEXT,               -- Stripe PaymentIntent-ID
  reserved_until TIMESTAMPTZ,           -- NULL sobald 'sold'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (x, y)
);

CREATE INDEX IF NOT EXISTS idx_pixels_status ON pixels (status);
CREATE INDEX IF NOT EXISTS idx_pixels_reserved_until ON pixels (reserved_until)
  WHERE status = 'reserved';

-- Grenzen absichern (0..999)
ALTER TABLE pixels ADD CONSTRAINT chk_x_range CHECK (x >= 0 AND x < 1000);
ALTER TABLE pixels ADD CONSTRAINT chk_y_range CHECK (y >= 0 AND y < 1000);
