import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { jsonOk, jsonError, validateAgencyKey } from '@/lib/helpers';

// ── GET /api/locations — List all locations (agency admin) ──
export async function GET(request: NextRequest) {
  if (!validateAgencyKey(request)) return jsonError('Unauthorized', 401);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('locations').select('*').order('name');
  if (error) return jsonError(error.message, 500);
  // Mask API keys in response
  const masked = (data || []).map((l: any) => ({ ...l, ghl_api_key: l.ghl_api_key ? '••••' + l.ghl_api_key.slice(-6) : '' }));
  return jsonOk({ locations: masked });
}

// ── POST /api/locations — Register a new sub-account (agency admin) ──
export async function POST(request: NextRequest) {
  if (!validateAgencyKey(request)) return jsonError('Unauthorized', 401);
  const supabase = getSupabaseAdmin();
  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const ghlLocationId = (body.ghlLocationId || body.ghl_location_id || '').trim();
  const name = (body.name || '').trim();
  if (!ghlLocationId) return jsonError('ghlLocationId required', 400);
  if (!name) return jsonError('Business name required', 400);

  const record: any = {
    ghl_location_id: ghlLocationId,
    name,
    ghl_api_key: (body.ghlApiKey || body.ghl_api_key || '').trim(),
    webhook_url: (body.webhookUrl || body.webhook_url || '').trim(),
    overtime_threshold: parseFloat(body.overtimeThreshold || body.overtime_threshold || '40') || 40,
    admin_password: (body.adminPassword || body.admin_password || 'admin').trim(),
    timezone: (body.timezone || 'America/New_York').trim(),
    is_active: true,
  };

  const { data, error } = await supabase.from('locations').upsert(record, { onConflict: 'ghl_location_id' }).select().single();
  if (error) return jsonError(error.message, 500);
  return jsonOk({ success: true, location: { ...data, ghl_api_key: data.ghl_api_key ? '••••' + data.ghl_api_key.slice(-6) : '' } }, 201);
}

// ── PUT /api/locations — Update a location (agency admin) ──
export async function PUT(request: NextRequest) {
  if (!validateAgencyKey(request)) return jsonError('Unauthorized', 401);
  const supabase = getSupabaseAdmin();
  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const { id, ...updates } = body;
  if (!id) return jsonError('Location id required', 400);

  const mapped: any = {};
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.ghlApiKey !== undefined) mapped.ghl_api_key = updates.ghlApiKey;
  if (updates.webhookUrl !== undefined) mapped.webhook_url = updates.webhookUrl;
  if (updates.overtimeThreshold !== undefined) mapped.overtime_threshold = parseFloat(updates.overtimeThreshold) || 40;
  if (updates.adminPassword !== undefined) mapped.admin_password = updates.adminPassword;
  if (updates.timezone !== undefined) mapped.timezone = updates.timezone;
  if (updates.isActive !== undefined) mapped.is_active = updates.isActive;
  if (updates.settings !== undefined) mapped.settings = updates.settings;

  const { data, error } = await supabase.from('locations').update(mapped).eq('id', id).select().single();
  if (error) return jsonError(error.message, 500);
  return jsonOk({ success: true, location: { ...data, ghl_api_key: data.ghl_api_key ? '••••' + data.ghl_api_key.slice(-6) : '' } });
}

// ── DELETE /api/locations?id=xxx — Deactivate location (agency admin) ──
export async function DELETE(request: NextRequest) {
  if (!validateAgencyKey(request)) return jsonError('Unauthorized', 401);
  const supabase = getSupabaseAdmin();
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('id required', 400);
  const { error } = await supabase.from('locations').update({ is_active: false }).eq('id', id);
  if (error) return jsonError(error.message, 500);
  return jsonOk({ success: true });
}
