import React, { useRef, useState, useEffect, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import CheckoutForm from './CheckoutForm.jsx';
import { fetchPixelsInRegion, fetchStats, startCheckout } from './api.js';

const GRID_SIZE = 1000;
const PIXEL_BASE = 6;
const PALETTE = [
  '#D97757', '#E8B04B', '#5DCAA5', '#378ADD',
  '#7F77DD', '#D4537E', '#2C2C2A', '#F1EFE8',
  '#639922', '#A32D2D', '#0C447C', '#412402'
];

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export default function App() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [scale, setScale] = useState(0.6);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const [hoverPixel, setHoverPixel] = useState(null);
  const [selectedPixel, setSelectedPixel] = useState(null);
  const [step, setStep] = useState('idle'); // idle | color | checkout | success | error
  const [chosenColor, setChosenColor] = useState(PALETTE[0]);
  const [pixelData, setPixelData] = useState({}); // "x,y" -> { color, status }
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 600 });
  const [clientSecret, setClientSecret] = useState(null);
  const [stats, setStats] = useState({ sold: 0, total: 1_000_000 });
  const [loadError, setLoadError] = useState(null);
  const [reservationDeadline, setReservationDeadline] = useState(null);

  useEffect(() => {
    function resize() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setCanvasSize({ w: rect.width, h: 520 });
      }
    }
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
  }, [step]);

  // Sichtbaren Bereich laden, wann immer sich Zoom/Position ändert
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
    }, 150); // kleines Debounce, damit wir beim Zoomen/Pannen nicht spammen

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
    ctx.fillStyle = '#151515';
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
          ctx.fillStyle = 'rgba(255,255,255,0.15)';
          ctx.fillRect(offset.x + col * px, offset.y + row * px, Math.ceil(px), Math.ceil(px));
        }
      }
    }

    if (px > 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
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
      ctx.strokeStyle = '#D97757';
      ctx.lineWidth = 2;
      ctx.strokeRect(offset.x + hoverPixel.x * px, offset.y + hoverPixel.y * px, px, px);
    }
    if (selectedPixel) {
      ctx.strokeStyle = '#5DCAA5';
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
        if (entry?.status === 'sold') return; // schon verkauft
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
  }

  async function proceedToCheckout() {
    try {
      const { clientSecret, reservedForMinutes } = await startCheckout(
        selectedPixel.x, selectedPixel.y, chosenColor
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

  const zoomLabel = scale >= 4 ? 'Nah dran' : scale >= 1.2 ? 'Normal' : 'Übersicht';

  return (
    <div style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: '#F1EFE8', background: '#0B0B0B', minHeight: '100vh', padding: '20px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>The Million Pixel Grid</h1>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#888780' }}>
              1.000 × 1.000 Pixel · {stats.sold.toLocaleString('de-DE')} von {stats.total.toLocaleString('de-DE')} verkauft · $1 pro Pixel
            </p>
          </div>
          <div style={{ fontSize: '12px', color: '#888780', textAlign: 'right' }}>
            <div>Zoom: {zoomLabel} ({scale.toFixed(1)}×)</div>
            <div>Scrollen zum Zoomen, Ziehen zum Verschieben</div>
          </div>
        </div>

        {loadError && step !== 'checkout' && (
          <p style={{ color: '#F09595', fontSize: '13px' }}>{loadError}</p>
        )}

        <div ref={containerRef} style={{ position: 'relative', marginTop: '12px', border: '1px solid #2C2C2A', borderRadius: '10px', overflow: 'hidden', background: '#151515' }}>
          <canvas
            ref={canvasRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setIsDragging(false); setHoverPixel(null); }}
            style={{ display: 'block', cursor: isDragging ? 'grabbing' : 'crosshair', width: '100%', height: '520px' }}
          />
          {hoverPixel && step === 'idle' && !isDragging && (
            <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(0,0,0,0.7)', padding: '6px 10px', borderRadius: '6px', fontSize: '12px', pointerEvents: 'none' }}>
              Pixel ({hoverPixel.x}, {hoverPixel.y})
              {pixelData[`${hoverPixel.x},${hoverPixel.y}`]?.status === 'sold' ? ' — bereits gekauft' : ' — klicken zum Kaufen'}
            </div>
          )}
        </div>

        {step === 'color' && selectedPixel && (
          <div style={{ marginTop: '16px', background: '#1A1A1A', border: '1px solid #2C2C2A', borderRadius: '10px', padding: '16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 500 }}>
              Pixel ({selectedPixel.x}, {selectedPixel.y}) — Farbe wählen
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {PALETTE.map(c => (
                <button key={c} onClick={() => setChosenColor(c)}
                  style={{ width: '32px', height: '32px', borderRadius: '6px', background: c, border: chosenColor === c ? '2px solid #F1EFE8' : '2px solid transparent', cursor: 'pointer' }}
                  aria-label={`Farbe ${c}`} />
              ))}
              <input type="color" value={chosenColor} onChange={e => setChosenColor(e.target.value)}
                style={{ width: '32px', height: '32px', borderRadius: '6px', border: 'none', padding: 0, background: 'none', cursor: 'pointer' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={resetFlow} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #444441', background: 'transparent', color: '#F1EFE8', cursor: 'pointer', fontSize: '13px' }}>
                Abbrechen
              </button>
              <button onClick={proceedToCheckout} style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#D97757', color: '#1A1A1A', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                Weiter zur Zahlung — $1
              </button>
            </div>
          </div>
        )}

        {step === 'checkout' && clientSecret && (
          <div style={{ marginTop: '16px', background: '#1A1A1A', border: '1px solid #2C2C2A', borderRadius: '10px', padding: '16px' }}>
            <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 500 }}>Zahlung — Pixel ({selectedPixel.x}, {selectedPixel.y})</p>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#888780' }}>
              Reserviert bis {reservationDeadline ? new Date(reservationDeadline).toLocaleTimeString('de-DE') : ''} — bitte in dieser Zeit abschließen.
            </p>
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night' } }}>
              <CheckoutForm onSuccess={handlePaymentSuccess} onCancel={resetFlow} />
            </Elements>
          </div>
        )}

        {step === 'success' && selectedPixel && (
          <div style={{ marginTop: '16px', background: '#12241C', border: '1px solid #1D9E75', borderRadius: '10px', padding: '16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: 500, color: '#9FE1CB' }}>
              Pixel ({selectedPixel.x}, {selectedPixel.y}) gehört jetzt dir.
            </p>
            <button onClick={resetFlow} style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#1D9E75', color: '#04342C', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              Weiteres Pixel kaufen
            </button>
          </div>
        )}

        {step === 'error' && (
          <div style={{ marginTop: '16px', background: '#2A1414', border: '1px solid #A32D2D', borderRadius: '10px', padding: '16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: '14px', color: '#F09595' }}>{loadError}</p>
            <button onClick={resetFlow} style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#A32D2D', color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              Erneut versuchen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
