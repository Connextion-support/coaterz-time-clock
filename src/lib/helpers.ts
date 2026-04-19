import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from './supabase';

// ── Phone ──
export function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.length === 11 && d[0] === '1' ? d.slice(1) : d;
}
export function formatPhone(p: string): string {
  const d = normalizePhone(p);
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return p;
}

// ── Date (Sun-Sat work week) ──
export function getSunday(date: Date): Date {
  const d = new Date(date); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d;
}
export function getSaturday(date: Date): Date {
  const d = new Date(date); d.setDate(d.getDate() + (6 - d.getDay())); d.setHours(23,59,59,999); return d;
}

// ── API helpers ──
export function jsonOk(data: any, status = 200) { return NextResponse.json(data, { status }); }
export function jsonError(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }

// ── Auth ──
export function validateAgencyKey(request: Request): boolean {
  const key = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
  return !!key && key === process.env.AGENCY_SECRET_KEY;
}

// ── Location resolver — finds location by GHL location ID ──
export async function resolveLocation(ghlLocationId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('ghl_location_id', ghlLocationId)
    .eq('is_active', true)
    .single();
  if (error || !data) return null;
  return data;
}

// ── GHL webhook fire ──
export async function fireGhlWebhook(url: string, payload: Record<string, any>) {
  if (!url) {
    console.warn('fireGhlWebhook: No URL configured, skipping');
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log(`Webhook fired to ${url} — status: ${res.status}`);
    if (!res.ok) {
      const text = await res.text();
      console.error(`Webhook response error: ${res.status} — ${text}`);
    }
  } catch (err) {
    console.error('Webhook fire failed:', err);
  }
}
