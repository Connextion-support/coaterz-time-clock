import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizePhone, jsonOk, jsonError } from '@/lib/helpers';

// ── POST /api/webhook — Inbound webhook from GHL ──
// GHL sends employee data here via HTTP Request action in a workflow.
//
// Expected payload (flexible field names to match GHL custom values):
// {
//   "fullName": "John Smith",           -- or "name", "full_name", "contact_name"
//   "phone": "5551234567",              -- or "phone_number", "Phone"
//   "department": "Crew A",             -- optional
//   "hourlyRate": 25.00,               -- optional
//   "ghlContactId": "abc123",          -- optional, for cross-referencing
//   "action": "add" | "update" | "deactivate"  -- optional, defaults to upsert
// }
//
// GHL Workflow Setup:
// 1. Trigger: Contact Created / Tag Added / Pipeline Stage Changed
// 2. Action: HTTP Request → POST to https://your-domain.com/api/webhook
// 3. Headers: Content-Type: application/json
// 4. Body: Map your GHL contact fields to the JSON above

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();

  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  // ── Log inbound webhook ──
  await supabase.from('webhook_log').insert({
    direction: 'inbound',
    event_type: body.action || 'employee_sync',
    payload: body,
  });

  // ── Parse flexible field names (GHL sends varying keys) ──
  const phone = normalizePhone(
    body.phone || body.Phone || body.phone_number || body.phoneNumber || body.mobile || ''
  );
  const fullName = (
    body.fullName || body.full_name || body.name || body.Name ||
    body.contact_name || body.contactName ||
    [body.firstName || body.first_name || '', body.lastName || body.last_name || ''].filter(Boolean).join(' ')
  ).trim();

  if (!phone || phone.length < 7) {
    await supabase.from('webhook_log').insert({
      direction: 'inbound', event_type: 'error',
      payload: body, status: 'error', error_message: 'No valid phone number',
    });
    return jsonError('Valid phone number required', 400);
  }

  const action = (body.action || 'upsert').toLowerCase();

  // ── DEACTIVATE ──
  if (action === 'deactivate' || action === 'remove' || action === 'delete') {
    const { error } = await supabase
      .from('employees')
      .update({ is_active: false })
      .eq('phone', phone);

    if (error) return jsonError(error.message, 500);
    return jsonOk({ success: true, action: 'deactivated', phone });
  }

  // ── UPSERT (add or update) ──
  if (!fullName) {
    return jsonError('Full name required for add/update', 400);
  }

  const employeeData: any = {
    phone,
    full_name: fullName,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  // Optional fields — only include if provided
  const dept = (body.department || body.Department || body.dept || '').trim();
  if (dept) employeeData.department = dept;

  const rate = parseFloat(body.hourlyRate || body.hourly_rate || body.rate || '');
  if (!isNaN(rate) && rate > 0) employeeData.hourly_rate = rate;

  const notes = (body.notes || body.Notes || '').trim();
  if (notes) employeeData.notes = notes;

  const ghlId = body.ghlContactId || body.ghl_contact_id || body.contactId || body.contact_id || '';
  if (ghlId) employeeData.ghl_contact_id = ghlId;

  const { data, error } = await supabase
    .from('employees')
    .upsert(employeeData, { onConflict: 'phone' })
    .select()
    .single();

  if (error) {
    await supabase.from('webhook_log').insert({
      direction: 'inbound', event_type: 'error',
      payload: body, status: 'error', error_message: error.message,
    });
    return jsonError(error.message, 500);
  }

  return jsonOk({
    success: true,
    action: 'upserted',
    employee: data,
  }, 201);
}

// ── GET /api/webhook — Health check / info ──
export async function GET() {
  return jsonOk({
    service: 'CoaterZ Time Clock — GHL Inbound Webhook',
    status: 'active',
    usage: 'POST employee data here from a GHL workflow to auto-create employees.',
    fields: {
      required: ['phone (or phone_number)', 'fullName (or name, first+last)'],
      optional: ['department', 'hourlyRate', 'ghlContactId', 'notes', 'action (add|update|deactivate)'],
    },
  });
}
