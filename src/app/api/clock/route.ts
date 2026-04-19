import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizePhone, jsonOk, jsonError, resolveLocation, fireGhlWebhook } from '@/lib/helpers';

// POST /api/clock — Clock in/out
// Body: { phone, locationId (GHL location ID), workOrder? }
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const ghlLocId = body.locationId || body.location_id || '';
  if (!ghlLocId) return jsonError('locationId required', 400);

  const location = await resolveLocation(ghlLocId);
  if (!location) return jsonError('Location not found or inactive', 404);

  const phone = normalizePhone(body.phone || '');
  if (!phone || phone.length < 7) return jsonError('Valid phone required', 400);

  // Find employee in this location
  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('location_id', location.id)
    .eq('phone', phone)
    .eq('is_active', true)
    .single();

  if (!employee) return jsonError('Employee not found in this location. Contact your admin.', 404);

  // Check active session
  const { data: activeEntry } = await supabase
    .from('time_entries')
    .select('*')
    .eq('employee_id', employee.id)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .single();

  const now = new Date().toISOString();

  // ── CLOCK OUT ──
  if (activeEntry) {
    const hoursWorked = Math.round((new Date(now).getTime() - new Date(activeEntry.clock_in).getTime()) / 3600000 * 100) / 100;
    const { data: updated } = await supabase
      .from('time_entries')
      .update({ clock_out: now, hours_worked: hoursWorked })
      .eq('id', activeEntry.id)
      .select().single();

    fireGhlWebhook(location.webhook_url, {
      event: 'clock_out', locationId: ghlLocId, employeeId: phone,
      fullName: employee.full_name, department: employee.department,
      clockIn: activeEntry.clock_in, clockOut: now, hoursWorked,
      workOrder: activeEntry.work_order, entryId: activeEntry.id,
    });

    return jsonOk({
      action: 'clock_out',
      employee: { id: employee.id, fullName: employee.full_name, phone: employee.phone, department: employee.department },
      entry: updated, hoursWorked,
      message: `${employee.full_name} clocked out — ${hoursWorked} hours`,
    });
  }

  // ── CLOCK IN ──
  const workOrder = (body.workOrder || body.work_order || '').trim() || null;
  const { data: newEntry } = await supabase
    .from('time_entries')
    .insert({ location_id: location.id, employee_id: employee.id, clock_in: now, work_order: workOrder })
    .select().single();

  fireGhlWebhook(location.webhook_url, {
    event: 'clock_in', locationId: ghlLocId, employeeId: phone,
    fullName: employee.full_name, department: employee.department,
    clockIn: now, workOrder, entryId: newEntry?.id,
  });

  return jsonOk({
    action: 'clock_in',
    employee: { id: employee.id, fullName: employee.full_name, phone: employee.phone, department: employee.department },
    entry: newEntry,
    message: `${employee.full_name} clocked in`,
  });
}

// GET /api/clock?phone=xxx&locationId=xxx — Check status
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const ghlLocId = searchParams.get('locationId') || '';
  const phone = normalizePhone(searchParams.get('phone') || '');
  if (!ghlLocId || !phone) return jsonOk({ found: false, clockedIn: false });

  const location = await resolveLocation(ghlLocId);
  if (!location) return jsonOk({ found: false, clockedIn: false });

  const { data: employee } = await supabase
    .from('employees').select('*')
    .eq('location_id', location.id).eq('phone', phone).eq('is_active', true).single();

  if (!employee) return jsonOk({ found: false, clockedIn: false });

  const { data: activeEntry } = await supabase
    .from('time_entries').select('*')
    .eq('employee_id', employee.id).is('clock_out', null).limit(1).single();

  return jsonOk({
    found: true,
    employee: { id: employee.id, fullName: employee.full_name, phone: employee.phone, department: employee.department },
    clockedIn: !!activeEntry, activeEntry: activeEntry || null,
  });
}
