'use client';

import QRCode from 'qrcode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { issueQrToken, qrWasScanned } from './qr-actions';

const RENEW_MS = 20_000; // el token vive 30 s: se renueva antes de que venza
const POLL_MS = 2_000;
const MAX_OPEN_MS = 2 * 60_000;

type Status = 'closed' | 'open' | 'scanned' | 'timeout' | 'error';

const CLOSED_TEXT: Record<Exclude<Status, 'open'>, string | null> = {
  closed: null,
  scanned: 'Listo: el cliente escaneó el QR.',
  timeout: 'El QR se cerró por tiempo. Muéstralo otra vez si hace falta.',
  error: 'No se pudo generar el QR. Intenta de nuevo.',
};

export function QrPanel({
  locations,
}: {
  locations: { id: string; name: string }[];
}) {
  const [status, setStatus] = useState<Status>('closed');
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const close = useCallback((next: Exclude<Status, 'open'>) => {
    setStatus(next);
  }, []);

  useEffect(() => {
    if (status !== 'open' || !locationId) return;
    let cancelled = false;
    const openedAt = new Date().toISOString();
    const startedMs = Date.now();

    async function renew() {
      const issued = await issueQrToken(locationId);
      if (cancelled) return;
      if (!issued.ok || !canvasRef.current) return close('error');
      await QRCode.toCanvas(canvasRef.current, issued.url, {
        width: 288,
        margin: 2,
        // Siempre negro sobre blanco, también en modo oscuro: es lo que lee la cámara.
        color: { dark: '#000000', light: '#ffffff' },
      });
    }

    async function poll() {
      if (Date.now() - startedMs >= MAX_OPEN_MS) return close('timeout');
      if (await qrWasScanned(openedAt)) {
        if (!cancelled) close('scanned');
      }
    }

    void renew();
    const renewTimer = setInterval(() => void renew(), RENEW_MS);
    const pollTimer = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(renewTimer);
      clearInterval(pollTimer);
    };
  }, [status, locationId, close]);

  const message = status === 'open' ? null : CLOSED_TEXT[status];

  return (
    <section className="flex flex-col items-start gap-3">
      {status !== 'open' ? (
        <>
          {locations.length > 1 ? (
            <label className="flex flex-col gap-1 text-sm">
              Sucursal
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            disabled={!locationId}
            onClick={() => setStatus('open')}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Mostrar QR de sello
          </button>
          {message ? (
            <p
              role="status"
              className="text-sm text-zinc-600 dark:text-zinc-400"
            >
              {message}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            aria-label="QR para sumar un sello"
            className="rounded-md bg-white"
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            El cliente lo escanea con la cámara. Se renueva solo y se cierra al
            escanearse.
          </p>
          <button
            type="button"
            onClick={() => close('closed')}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
          >
            Cerrar QR
          </button>
        </>
      )}
    </section>
  );
}
