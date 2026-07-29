const API_URL = import.meta.env.VITE_API_URL;

export async function fetchPixelsInRegion(x0, y0, x1, y1) {
  const params = new URLSearchParams({ x0, y0, x1, y1 });
  const res = await fetch(`${API_URL}/api/pixels?${params}`);
  if (!res.ok) throw new Error('Pixel konnten nicht geladen werden.');
  const data = await res.json();
  return data.pixels;
}

export async function fetchStats() {
  const res = await fetch(`${API_URL}/api/stats`);
  if (!res.ok) throw new Error('Statistik konnte nicht geladen werden.');
  return res.json();
}

export async function startCheckout(x, y, color) {
  const res = await fetch(`${API_URL}/api/pixels/${x}/${y}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Checkout konnte nicht gestartet werden.');
  }
  return data; // { clientSecret, reservedForMinutes }
}
