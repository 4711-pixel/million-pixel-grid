import React, { useRef, useState, useEffect, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import CheckoutForm from './CheckoutForm.jsx';
import { fetchPixelsInRegion, fetchStats, startCheckout } from './api.js';
import { colors, palette, fonts } from './theme.js';

const GRID_SIZE = 1000;
const PIXEL_BASE = 6;
const GRID_HEIGHT = 640;

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export default function App({ onNavigate }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [scale, setScale] = useState(0.55);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const [hoverPixel, setHoverPixel] = useState(null);
  const [selectedPixel, setSelectedPixel] = useState(null);
  const [step, setStep] = useState('idle'); // idle | color | checkout | success | error
  const [chosenColor, setChosenColor] = useState(palette[0]);
  const [pixelData, setPixelData] = useState({}); // "x,y" -> { color, status }
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: GRID_HEIGHT });
  const [clientSecret, setClientSecret] = useState(null);
  const [stats, setStats] = useState({ sold: 0, total: 1_000_000 });
  const [loadError, setLoadError] = useState(null);
  const [reservationDeadline, setReservationDeadline] = useState(null);
  const [waiverAccepted, setWaiverAccepted] = useState(false);

  useEffect(() => {
    function resize() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({ w: rect.width, h: GRID_HEIGHT });
      }
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
  }, [step]);

  useEffect(() => {
    const px = PIXEL_BASE * scale;
    const x0 = Math.max(0, Math.floor(-offset.x / px));
    const x1 = Math.min(GRID_SIZE, Math.ceil((canvasSize.w - offset.x) / px));
    const y0 = Math.max(0, Math.floor(-offset.y / px));
    const y1 = Math.min(GRID_SIZE, Math.ceil((canvasSize.h - offset.y) / px));

    if (x1 <= x0 || y1 <= y0) return;

    const timeout = setTimeout(() => {
      fetchPixelsInRegion(x0, y0, x1, y1)
        .then(pixels => {
          setPixelData(prev => {
            const next = { ...prev };
            for (const p of pixels) {
              next[`${p.x},${p.y}`] = { color: p.color, status: p.status };
            }
            return next;
          });
          setLoadError(null);
        })
        .catch(err => setLoadError(err.message));
    }, 150);

    return () => clearTimeout(timeout);
  }, [scale, offset, canvasSize]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize.w * dpr;
    canvas.height = canvasSize.h * dpr;
    canvas.style.width = canvasSize.w + 'px';
    canvas.style.height = canvasSize.h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.white;
    ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

    const px = PIXEL_BASE * scale;
    const startCol = Math.max(0, Math.floor(-offset.x / px));
    const endCol = Math.min(GRID_SIZE, Math.ceil((canvasSize.w - offset.x) / px));
    const startRow = Math.max(0, Math.floor(-offset.y / px));
    const endRow = Math.min(GRID_SIZE, Math.ceil((canvasSize.h - offset.y) / px));

    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const entry = pixelData[`${col},${row}`];
        if (entry?.color) {
          ctx.fillStyle = entry.color;
          ctx.fillRect(offset.x + col * px, offset.y + row * px, Math.ceil(px), Math.ceil(px));
        } else if (entry?.status === 'reserved') {
          ctx.fillStyle = colors.reservedFill;
          ctx.fillRect(offset.x + col * px, offset.y + row * px, Math.ceil(px), Math.ceil(px));
        }
      }
    }

    if (px > 4) {
      ctx.strokeStyle = colors.gridLine;
      ctx.lineWidth = 1;
      for (let col = startCol; col <= endCol; col++) {
        const xpos = offset.x + col * px;
        ctx.beginPath();
        ctx.moveTo(xpos, Math.max(0, offset.y));
        ctx.lineTo(xpos, Math.min(canvasSize.h, offset.y + GRID_SIZE * px));
        ctx.stroke();
      }
      for (let row = startRow; row <= endRow; row++) {
        const ypos = offset.y + row * px;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, offset.x), ypos);
        ctx.lineTo(Math.min(canvasSize.w, offset.x + GRID_SIZE * px), ypos);
        ctx.stroke();
      }
    }

    if (hoverPixel) {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(offset.x + hoverPixel.x * px, offset.y + hoverPixel.y * px, px, px);
    }
    if (selectedPixel) {
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(offset.x + selectedPixel.x * px, offset.y + selectedPixel.y * px, px, px);
    }
  }, [scale, offset, canvasSize, hoverPixel, selectedPixel, pixelData]);

  useEffect(() => { draw(); }, [draw]);

  function toGrid(clientX, clientY) {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const px = PIXEL_BASE * scale;
    return { x: Math.floor((cx - offset.x) / px), y: Math.floor((cy - offset.y) / px) };
  }

  function handleWheel(e) {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.min(40, Math.max(0.2, scale * zoomFactor));
    const gxBefore = (cx - offset.x) / (PIXEL_BASE * scale);
    const gyBefore = (cy - offset.y) / (PIXEL_BASE * scale);
    setScale(newScale);
    setOffset({ x: cx - gxBefore * PIXEL_BASE * newScale, y: cy - gyBefore * PIXEL_BASE * newScale });
  }

  function handleMouseDown(e) {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = { ...offset };
  }

  function handleMouseMove(e) {
    if (isDragging) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setOffset({ x: offsetStart.current.x + dx, y: offsetStart.current.y + dy });
      }
    } else {
      const g = toGrid(e.clientX, e.clientY);
      setHoverPixel(g.x >= 0 && g.x < GRID_SIZE && g.y >= 0 && g.y < GRID_SIZE ? g : null);
    }
  }

  function handleMouseUp(e) {
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const moved = Math.abs(dx) > 3 || Math.abs(dy) > 3;
    setIsDragging(false);
    if (!moved) {
      const g = toGrid(e.clientX, e.clientY);
      if (g.x >= 0 && g.x < GRID_SIZE && g.y >= 0 && g.y < GRID_SIZE) {
        const entry = pixelData[`${g.x},${g.y}`];
        if (entry?.status === 'sold') return;
        setSelectedPixel(g);
        setStep('color');
      }
    }
  }

  function resetFlow() {
    setStep('idle');
    setSelectedPixel(null);
    setClientSecret(null);
    setReservationDeadline(null);
    setWaiverAccepted(false);
  }

  async function proceedToCheckout() {
    if (!waiverAccepted) return;
    try {
      const { clientSecret, reservedForMinutes } = await startCheckout(
        selectedPixel.x, selectedPixel.y, chosenColor, waiverAccepted
      );
      setClientSecret(clientSecret);
      setReservationDeadline(Date.now() + reservedForMinutes * 60_000);
      setStep('checkout');
    } catch (err) {
      setLoadError(err.message);
      setStep('error');
    }
  }

  function handlePaymentSuccess() {
    setPixelData(prev => ({
      ...prev,
      [`${selectedPixel.x},${selectedPixel.y}`]: { color: chosenColor, status: 'sold' }
    }));
    setStep('success');
  }

  const zoomLabel = scale >= 4 ? 'nah dran' : scale >= 1.2 ? 'normal' : 'Übersicht';

  return (
    <div style={{ fontFamily: fonts.body, color: colors.ink, background: colors.cream, minHeight: '100vh', padding: '32px 20px' }}>
      <div style={{ maxWidth: '1600px', margin: '0 auto', background: colors.cream, border: `1px solid ${colors.border}`, borderRadius: '14px', overflow: 'hidden' }}>

        <div style={{ padding: '26px 28px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h1 style={{ fontFamily: fonts.display, fontSize: '26px', fontWeight: 600, margin: 0, letterSpacing: '-0.01em', color: colors.ink }}>
              The Million Pixel Grid
            </h1>
            <p style={{ fontSize: '13px', color: colors.muted, margin: '8px 0 0' }}>
              1.000 × 1.000 Pixel · <span style={{ color: colors.ink, fontWeight: 500 }}>{stats.sold.toLocaleString('de-DE')}</span> von {stats.total.toLocaleString('de-DE')} vergeben · $1 pro Pixel
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '12px', color: colors.muted }}>
            <div>Zoom: {zoomLabel}</div>
            <div style={{ marginTop: '2px' }}>Scrollen zum Zoomen, Ziehen zum Verschieben</div>
          </div>
        </div>

        {loadError && step !== 'checkout' && (
          <p style={{ color: colors.danger, fontSize: '13px', margin: '0 28px 12px' }}>{loadError}</p>
        )}

        <div
          ref={containerRef}
          style={{ position: 'relative', margin: '0 20px 20px', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${colors.border}` }}
        >
          <canvas
            ref={canvasRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setIsDragging(false); setHoverPixel(null); }}
            style={{ display: 'block', cursor: isDragging ? 'grabbing' : 'crosshair', width: '100%', height: `${GRID_HEIGHT}px`, background: colors.white }}
          />
          {hoverPixel && step === 'idle' && !isDragging && (
            <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: colors.ink, color: colors.cream, padding: '5px 9px', borderRadius: '4px', fontSize: '11px', pointerEvents: 'none' }}>
              Pixel ({hoverPixel.x}, {hoverPixel.y})
              {pixelData[`${hoverPixel.x},${hoverPixel.y}`]?.status === 'sold' ? ' — bereits vergeben' : ' — klicken zum Kaufen'}
            </div>
          )}
        </div>

        {step === 'color' && selectedPixel && (
          <div style={{ margin: '0 20px 20px', background: colors.white, border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '18px 20px' }}>
            <p style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 500, color: colors.ink }}>
              Pixel ({selectedPixel.x}, {selectedPixel.y}) — Farbe wählen
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {palette.map(c => (
                <button
                  key={c}
                  onClick={() => setChosenColor(c)}
                  style={{
                    width: '30px', height: '30px', borderRadius: '6px', background: c,
                    border: chosenColor === c ? `2px solid ${colors.ink}` : `2px solid ${colors.border}`,
                    cursor: 'pointer'
                  }}
                  aria-label={`Farbe ${c}`}
                />
              ))}
              <input
                type="color"
                value={chosenColor}
                onChange={e => setChosenColor(e.target.value)}
                style={{ width: '30px', height: '30px', borderRadius: '6px', border: `1px solid ${colors.border}`, padding: 0, background: 'none', cursor: 'pointer' }}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '16px', fontSize: '12px', color: colors.muted, cursor: 'pointer', lineHeight: 1.5 }}>
              <input
                type="checkbox"
                checked={waiverAccepted}
                onChange={e => setWaiverAccepted(e.target.checked)}
                style={{ marginTop: '2px', flexShrink: 0, cursor: 'pointer' }}
              />
              <span>
                Ich stimme ausdrücklich zu, dass die Ausführung des Vertrags (Freischaltung
                meines Pixels) sofort nach Zahlungseingang beginnt, und bestätige, dass ich
                dadurch mein gesetzliches Widerrufsrecht verliere, sobald die Zahlung
                abgeschlossen ist (§ 356 Abs. 5 BGB). Ich habe die{' '}
                <a
                  onClick={(e) => { e.preventDefault(); onNavigate('/agb'); }}
                  href="/agb"
                  style={{ color: colors.accent }}
                >
                  AGB
                </a>
                {' '}gelesen und akzeptiere sie.
              </span>
            </label>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={resetFlow}
                style={{ padding: '9px 16px', borderRadius: '7px', border: `1px solid ${colors.border}`, background: 'transparent', color: colors.ink, cursor: 'pointer', fontSize: '13px' }}
              >
                Abbrechen
              </button>
              <button
                onClick={proceedToCheckout}
                disabled={!waiverAccepted}
                title={!waiverAccepted ? 'Bitte zuerst der sofortigen Ausführung zustimmen' : undefined}
                style={{ padding: '9px 18px', borderRadius: '7px', border: 'none', background: colors.accent, color: colors.accentText, cursor: waiverAccepted ? 'pointer' : 'default', fontSize: '13px', fontWeight: 500, opacity: waiverAccepted ? 1 : 0.45 }}
              >
                Weiter zur Zahlung — $1
              </button>
            </div>
          </div>
        )}

        {step === 'checkout' && clientSecret && (
          <div style={{ margin: '0 20px 20px', background: colors.white, border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '18px 20px' }}>
            <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 500, color: colors.ink }}>
              Zahlung — Pixel ({selectedPixel.x}, {selectedPixel.y})
            </p>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: colors.muted }}>
              Reserviert bis {reservationDeadline ? new Date(reservationDeadline).toLocaleTimeString('de-DE') : ''} — bitte in dieser Zeit abschließen.
            </p>
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: colors.accent, colorBackground: colors.white, colorText: colors.ink, borderRadius: '7px' } } }}>
              <CheckoutForm onSuccess={handlePaymentSuccess} onCancel={resetFlow} />
            </Elements>
          </div>
        )}

        {step === 'success' && selectedPixel && (
          <div style={{ margin: '0 20px 20px', background: colors.successBg, border: `1px solid ${colors.success}`, borderRadius: '10px', padding: '18px 20px' }}>
            <p style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 500, color: colors.success }}>
              Pixel ({selectedPixel.x}, {selectedPixel.y}) gehört jetzt dir.
            </p>
            <button
              onClick={resetFlow}
              style={{ padding: '9px 16px', borderRadius: '7px', border: 'none', background: colors.success, color: colors.white, cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
            >
              Weiteres Pixel kaufen
            </button>
          </div>
        )}

        {step === 'error' && (
          <div style={{ margin: '0 20px 20px', background: colors.dangerBg, border: `1px solid ${colors.danger}`, borderRadius: '10px', padding: '18px 20px' }}>
            <p style={{ margin: '0 0 12px', fontSize: '14px', color: colors.danger }}>{loadError}</p>
            <button
              onClick={resetFlow}
              style={{ padding: '9px 16px', borderRadius: '7px', border: 'none', background: colors.danger, color: colors.white, cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
            >
              Erneut versuchen
            </button>
          </div>
        )}

        <div style={{ padding: '20px 28px', borderTop: `1px solid ${colors.border}`, display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '12px' }}>
          <a onClick={(e) => { e.preventDefault(); onNavigate('/impressum'); }} href="/impressum" style={{ color: colors.muted }}>
            Impressum
          </a>
          <a onClick={(e) => { e.preventDefault(); onNavigate('/datenschutz'); }} href="/datenschutz" style={{ color: colors.muted }}>
            Datenschutz
          </a>
          <a onClick={(e) => { e.preventDefault(); onNavigate('/agb'); }} href="/agb" style={{ color: colors.muted }}>
            AGB
          </a>
        </div>
      </div>
    </div>
  );
}
