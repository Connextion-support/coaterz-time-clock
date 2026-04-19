import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { jsonOk, jsonError } from '@/lib/helpers';

// POST /api/auth
// Body: { password, locationId? (GHL location ID), type: "location" | "agency" }
export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const password = body.password || '';
  const type = body.type || 'location';

  // ── Agency admin login ──
  if (type === 'agency') {
    const agencyPass = process.env.AGENCY_PASSWORD || 'agency_admin';
    if (password !== agencyPass) return jsonError('Invalid password', 401);
    return jsonOk({
      success: true,
      type: 'agency',
      token: process.env.AGENCY_SECRET_KEY || 'dev-agency-token',
    });
  }

  // ── Location admin login ──
  const ghlLocationId = body.locationId || body.ghl_location_id || '';
  if (!ghlLocationId) return jsonError('Location ID required', 400);

  const supabase = getSupabaseAdmin();
  const { data: location } = await supabase
    .from('locations')
    .select('id, name, admin_password, ghl_location_id')
    .eq('ghl_location_id', ghlLocationId)
    .eq('is_active', true)
    .single();

  if (!location) return jsonError('Location not found', 404);
  if (password !== location.admin_password) return jsonError('Invalid password', 401);

  return jsonOk({
    success: true,
    type: 'location',
    locationId: location.id,
    ghlLocationId: location.ghl_location_id,
    locationName: location.name,
    // Return a token the frontend can use (location UUID acts as scoped token)
    token: location.id,
  });
}
