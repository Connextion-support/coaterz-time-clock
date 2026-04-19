import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizePhone, jsonOk, jsonError, fireGhlWebhook } from '@/lib/helpers';

// ── POST /api/clock — Clock in or clock out ──
// Body: { phone, workOrder? }
// Logic: If employee has an active session → clock out. Otherwise → clock in.
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();

  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const phone = normalizePhone(body.phone || '');
  if (!phone || phone.length < 7) {
    return jsonError('Valid phone number required', 400);
  }

  // ── Look up employee ──
  const { data: employee, error: empErr } = await supabase
    .from('employees')
    .select('*')
    .eq('phone', phone)
    .eq('is_active', true)
    .single();

  if (empErr || !employee) {
    return jsonError('Employee not found. Contact your admin to be added to the system.', 404);
  }

  // ── Check for active session ──
  const { data: activeEntry } = await supabase
    .from('time_entries')
    .select('*')
    .eq('employee_id', employee.id)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1)
    .single();

  const now = new Date().toISOString();

  // ═══════════════════════════════════════
  //  CLOCK OUT (active session exists)
  // ═══════════════════════════════════════
  if (activeEntry) {
    const hoursWorked = Math.round(
      (new Date(now).getTime() - new Date(activeEntry.clock_in).getTime()) / 3600000 * 100
    ) / 100;

    const { data: updated, error: updateErr } = await supabase
      .from('time_entries')
      .update({ clock_out: now, hours_worked: hoursWorked })
      .eq('id', activeEntry.id)
      .select()
      .single();

    if (updateErr) return jsonError(updateErr.message, 500);

    // Fire GHL webhook
    fireGhlWebhook({
      event: 'clock_out',
      employeeId: phone,
      fullName: employee.full_name,
      department: employee.department,
      clockIn: activeEntry.clock_in,
      clockOut: now,
      hoursWorked,
      workOrder: activeEntry.work_order,
      entryId: activeEntry.id,
    });

    // Log
    await supabase.from('webhook_log').insert({
      direction: 'outbound',
      event_type: 'clock_out',
      payload: { employeeId: phone, entryId: activeEntry.id, hoursWorked },
      status: 'success',
    });

    return jsonOk({
      action: 'clock_out',
      employee: {
        id: employee.id,
        fullName: employee.full_name,
        phone: employee.phone,
        department: employee.department,
      },
      entry: updated,
      hoursWorked,
      message: `${employee.full_name} clocked out — ${hoursWorked} hours`,
    });
  }

  // ═══════════════════════════════════════
  //  CLOCK IN (no active session)
  // ═══════════════════════════════════════
  const workOrder = (body.workOrder || body.work_order || '').trim() || null;

  const { data: newEntry, error: insertErr } = await supabase
    .from('time_entries')
    .insert({
      employee_id: employee.id,
      clock_in: now,
      work_order: workOrder,
    })
    .select()
    .single();

  if (insertErr) return jsonError(insertErr.message, 500);

  // Fire GHL webhook
  fireGhlWebhook({
    event: 'clock_in',
    employeeId: phone,
    fullName: employee.full_name,
    department: employee.department,
    clockIn: now,
    workOrder,
    entryId: newEntry.id,
  });

  // Log
  await supabase.from('webhook_log').insert({
    direction: 'outbound',
    event_type: 'clock_in',
    payload: { employeeId: phone, entryId: newEntry.id },
    status: 'success',
  });

  return jsonOk({
    action: 'clock_in',
    employee: {
      id: employee.id,
      fullName: employee.full_name,
      phone: employee.phone,
      department: employee.department,
    },
    entry: newEntry,
    message: `${employee.full_name} clocked in`,
  });
}

// ── GET /api/clock?phone=xxx — Check status for a phone number ──
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);
  const phone = normalizePhone(searchParams.get('phone') || '');

  if (!phone) return jsonError('Phone required', 400);

  // Look up employee
  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('phone', phone)
    .eq('is_active', true)
    .single();

  if (!employee) {
    return jsonOk({ found: false, clockedIn: false });
  }

  // Check active session
  const { data: activeEntry } = await supabase
    .from('time_entries')
    .select('*')
    .eq('employee_id', employee.id)
    .is('clock_out', null)
    .limit(1)
    .single();

  return jsonOk({
    found: true,
    employee: {
      id: employee.id,
      fullName: employee.full_name,
      phone: employee.phone,
      department: employee.department,
    },
    clockedIn: !!activeEntry,
    activeEntry: activeEntry || null,
  });
}
