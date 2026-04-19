import { NextResponse } from 'next/server';

// ── Phone normalization (strip to 10 digits) ──
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') return digits.slice(1);
  return digits;
}

export function formatPhone(phone: string): string {
  const d = normalizePhone(phone);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return phone;
}

// ── Date helpers (Sun-Sat work week) ──
export function getSunday(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getSaturday(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + (6 - d.getDay()));
  d.setHours(23, 59, 59, 999);
  return d;
}

// ── API response helpers ──
export function jsonOk(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// ── API key validation ──
export function validateApiKey(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const apiKey = request.headers.get('x-api-key');
  const secret = process.env.API_SECRET_KEY;

  if (!secret) return false;

  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7) === secret;
  }
  if (apiKey) {
    return apiKey === secret;
  }
  return false;
}

// ── GHL webhook fire ──
export async function fireGhlWebhook(payload: Record<string, any>) {
  const url = process.env.GHL_WEBHOOK_URL;
  if (!url) return;

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('GHL webhook fire failed:', err);
  }
}
