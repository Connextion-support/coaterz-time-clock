import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizePhone, jsonOk, jsonError, resolveLocation } from '@/lib/helpers';

// POST /api/webhook — Inbound webhook for individual user push
// Body must include locationId to scope to correct sub-account
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const ghlLocId = body.locationId || body.location_id || body.ghl_location_id || '';
  if (!ghlLocId) return jsonError('locationId required to identify sub-account', 400);

  const location = await resolveLocation(ghlLocId);
  if (!location) return jsonError('Location not found', 404);

  const phone = normalizePhone(body.phone || body.Phone || body.phone_number || '');
  const fullName = (body.fullName || body.full_name || body.name || [body.firstName||'', body.lastName||''].filter(Boolean).join(' ')).trim();
  if (!phone || phone.length < 7) return jsonError('Valid phone required', 400);

  const action = (body.action || 'upsert').toLowerCase();
  if (action === 'deactivate' || action === 'remove') {
    await supabase.from('employees').update({ is_active: false }).eq('location_id', location.id).eq('phone', phone);
    return jsonOk({ success: true, action: 'deactivated' });
  }

  if (!fullName) return jsonError('Full name required', 400);

  const empData: any = {
    location_id: location.id, phone, full_name: fullName, email: (body.email||'').trim(),
    source: 'ghl_user', is_active: true, last_synced_at: new Date().toISOString(),
  };
  if (body.ghlUserId || body.ghl_user_id) empData.ghl_user_id = body.ghlUserId || body.ghl_user_id;
  if (body.role) empData.role = body.role;
  if (body.department) empData.department = body.department;
  const rate = parseFloat(body.hourlyRate || body.hourly_rate || '');
  if (!isNaN(rate) && rate > 0) empData.hourly_rate = rate;

  const { data, error } = await supabase.from('employees').upsert(empData, { onConflict: 'location_id,phone' }).select().single();
  if (error) return jsonError(error.message, 500);

  await supabase.from('sync_log').insert({ location_id: location.id, direction: 'inbound', event_type: 'user_webhook', payload: body, status: 'success' });
  return jsonOk({ success: true, employee: data }, 201);
}

export async function GET() {
  return jsonOk({ service: 'CoaterZ Time Clock — Multi-Tenant User Webhook', note: 'Include locationId in payload to scope to a sub-account.' });
}
