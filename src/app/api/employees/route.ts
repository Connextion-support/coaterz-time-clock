import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizePhone, jsonOk, jsonError, validateApiKey } from '@/lib/helpers';

// ── GET /api/employees — List all employees ──
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get('active') !== 'false';

  let query = supabase
    .from('employees')
    .select('*')
    .order('full_name', { ascending: true });

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);

  return jsonOk({ employees: data });
}

// ── POST /api/employees — Create or update employee ──
// This is the endpoint GHL calls to push employees into the system.
// Accepts: { fullName, phone, department?, hourlyRate?, notes?, ghlContactId? }
// Auth: x-api-key header OR Bearer token
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  // ── Validate required fields ──
  const phone = normalizePhone(body.phone || body.Phone || body.phone_number || '');
  const fullName = (body.fullName || body.full_name || body.name || body.Name || '').trim();

  if (!phone || phone.length < 7) {
    return jsonError('Valid phone number is required', 400);
  }
  if (!fullName) {
    return jsonError('Full name is required', 400);
  }

  // ── Build employee record ──
  const employeeData: any = {
    phone,
    full_name: fullName,
    department: (body.department || body.Department || '').trim(),
    notes: (body.notes || body.Notes || '').trim(),
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  // Optional fields
  if (body.hourlyRate || body.hourly_rate) {
    employeeData.hourly_rate = parseFloat(body.hourlyRate || body.hourly_rate);
  }
  if (body.ghlContactId || body.ghl_contact_id || body.contactId) {
    employeeData.ghl_contact_id = body.ghlContactId || body.ghl_contact_id || body.contactId;
  }

  // ── Upsert (create or update by phone) ──
  const { data, error } = await supabase
    .from('employees')
    .upsert(employeeData, { onConflict: 'phone' })
    .select()
    .single();

  if (error) return jsonError(error.message, 500);

  // ── Log the webhook event ──
  await supabase.from('webhook_log').insert({
    direction: 'inbound',
    event_type: 'employee_upsert',
    payload: body,
    status: 'success',
  });

  return jsonOk({ success: true, employee: data }, 201);
}

// ── DELETE /api/employees?id=xxx — Deactivate employee ──
export async function DELETE(request: NextRequest) {
  if (!validateApiKey(request)) return jsonError('Unauthorized', 401);

  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return jsonError('Employee ID required', 400);

  const { error } = await supabase
    .from('employees')
    .update({ is_active: false })
    .eq('id', id);

  if (error) return jsonError(error.message, 500);

  return jsonOk({ success: true });
}

// ── PUT /api/employees — Update employee ──
export async function PUT(request: NextRequest) {
  if (!validateApiKey(request)) return jsonError('Unauthorized', 401);

  const supabase = getSupabaseAdmin();
  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const { id, ...updates } = body;
  if (!id) return jsonError('Employee ID required', 400);

  // Map camelCase to snake_case
  const mapped: any = {};
  if (updates.fullName) mapped.full_name = updates.fullName;
  if (updates.phone) mapped.phone = normalizePhone(updates.phone);
  if (updates.department !== undefined) mapped.department = updates.department;
  if (updates.hourlyRate !== undefined) mapped.hourly_rate = updates.hourlyRate ? parseFloat(updates.hourlyRate) : null;
  if (updates.notes !== undefined) mapped.notes = updates.notes;
  if (updates.isActive !== undefined) mapped.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('employees')
    .update(mapped)
    .eq('id', id)
    .select()
    .single();

  if (error) return jsonError(error.message, 500);

  return jsonOk({ success: true, employee: data });
}
