import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizePhone, jsonOk, jsonError, resolveLocation } from '@/lib/helpers';

// GET /api/employees?locationId=xxx
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const ghlLocId = searchParams.get('locationId') || '';
  if (!ghlLocId) return jsonError('locationId required', 400);

  const location = await resolveLocation(ghlLocId);
  if (!location) return jsonError('Location not found', 404);

  const activeOnly = searchParams.get('active') !== 'false';
  let query = supabase.from('employees').select('*').eq('location_id', location.id).order('full_name');
  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);
  return jsonOk({ employees: data, locationName: location.name });
}

// POST /api/employees — Manual add
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const ghlLocId = body.locationId || body.location_id || '';
  if (!ghlLocId) return jsonError('locationId required', 400);

  const location = await resolveLocation(ghlLocId);
  if (!location) return jsonError('Location not found', 404);

  const phone = normalizePhone(body.phone || '');
  const fullName = (body.fullName || body.full_name || '').trim();
  if (!phone || phone.length < 7) return jsonError('Valid phone required', 400);
  if (!fullName) return jsonError('Full name required', 400);

  const { data, error } = await supabase.from('employees').upsert({
    location_id: location.id, phone, full_name: fullName,
    email: (body.email || '').trim(), department: (body.department || '').trim(),
    hourly_rate: body.hourlyRate ? parseFloat(body.hourlyRate) : null,
    notes: (body.notes || '').trim(), source: 'manual', is_active: true,
  }, { onConflict: 'location_id,phone' }).select().single();

  if (error) return jsonError(error.message, 500);
  return jsonOk({ success: true, employee: data }, 201);
}

// PUT /api/employees — Update
export async function PUT(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }
  const { id, ...u } = body;
  if (!id) return jsonError('Employee id required', 400);

  const mapped: any = {};
  if (u.fullName !== undefined) mapped.full_name = u.fullName;
  if (u.phone !== undefined) mapped.phone = normalizePhone(u.phone);
  if (u.email !== undefined) mapped.email = u.email;
  if (u.department !== undefined) mapped.department = u.department;
  if (u.hourlyRate !== undefined) mapped.hourly_rate = u.hourlyRate ? parseFloat(u.hourlyRate) : null;
  if (u.notes !== undefined) mapped.notes = u.notes;
  if (u.isActive !== undefined) mapped.is_active = u.isActive;

  const { data, error } = await supabase.from('employees').update(mapped).eq('id', id).select().single();
  if (error) return jsonError(error.message, 500);
  return jsonOk({ success: true, employee: data });
}

// DELETE /api/employees?id=xxx
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('id required', 400);
  const { error } = await supabase.from('employees').update({ is_active: false }).eq('id', id);
  if (error) return jsonError(error.message, 500);
  return jsonOk({ success: true });
}
