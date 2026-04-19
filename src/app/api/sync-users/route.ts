import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizePhone, jsonOk, jsonError, resolveLocation } from '@/lib/helpers';

// POST /api/sync-users — Pull GHL sub-account users for a specific location
// Body: { locationId } or query param ?locationId=xxx
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  let body: any = {};
  try { body = await request.json(); } catch {}

  const ghlLocId = body.locationId || new URL(request.url).searchParams.get('locationId') || '';
  if (!ghlLocId) return jsonError('locationId required', 400);

  const location = await resolveLocation(ghlLocId);
  if (!location) return jsonError('Location not found', 404);
  if (!location.ghl_api_key) return jsonError('GHL API key not configured for this location. Set it in the agency admin panel.', 400);

  try {
    const ghlRes = await fetch(`https://services.leadconnectorhq.com/users/?locationId=${location.ghl_location_id}`, {
      headers: { 'Authorization': `Bearer ${location.ghl_api_key}`, 'Version': '2021-07-28', 'Accept': 'application/json' },
    });

    if (!ghlRes.ok) {
      const errText = await ghlRes.text();
      await supabase.from('sync_log').insert({ location_id: location.id, event_type: 'ghl_user_sync', direction: 'inbound', payload: { error: errText, status: ghlRes.status }, status: 'error', error_message: `GHL ${ghlRes.status}` });
      return jsonError(`GHL API error (${ghlRes.status})`, 502);
    }

    const ghlData = await ghlRes.json();
    const ghlUsers = ghlData.users || [];
    if (!ghlUsers.length) return jsonOk({ success: true, message: 'No users found in GHL', synced: 0 });

    let synced = 0, skipped = 0;
    const errors: string[] = [];
    const syncedUsers: any[] = [];

    for (const user of ghlUsers) {
      const phone = normalizePhone(user.phone || user.extension || '');
      if (!phone || phone.length < 7) { skipped++; errors.push(`Skipped "${user.name || user.email}" — no phone`); continue; }

      const fullName = (user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unknown').trim();
      const empData: any = {
        location_id: location.id, phone, full_name: fullName,
        email: user.email || '', role: user.role || user.type || '',
        source: 'ghl_user', ghl_user_id: user.id, is_active: true,
        last_synced_at: new Date().toISOString(),
      };

      // Check if exists by ghl_user_id in this location
      const { data: existing } = await supabase.from('employees').select('id, department, hourly_rate, notes')
        .eq('location_id', location.id).eq('ghl_user_id', user.id).single();

      if (existing) {
        await supabase.from('employees').update({
          full_name: fullName, phone, email: user.email || '', role: user.role || '',
          is_active: true, last_synced_at: new Date().toISOString(),
        }).eq('id', existing.id);
        synced++; syncedUsers.push({ name: fullName, phone, action: 'updated' });
      } else {
        const { error } = await supabase.from('employees').upsert(empData, { onConflict: 'location_id,phone' });
        if (error) {
          // Try linking existing manual employee
          await supabase.from('employees').update({
            ghl_user_id: user.id, full_name: fullName, email: user.email || '',
            source: 'ghl_user', is_active: true, last_synced_at: new Date().toISOString(),
          }).eq('location_id', location.id).eq('phone', phone);
          synced++; syncedUsers.push({ name: fullName, phone, action: 'linked' });
        } else {
          synced++; syncedUsers.push({ name: fullName, phone, action: 'created' });
        }
      }
    }

    // Deactivate removed GHL users
    const ghlUserIds = ghlUsers.map((u: any) => u.id).filter(Boolean);
    if (ghlUserIds.length) {
      const { data: stale } = await supabase.from('employees').select('id, full_name, ghl_user_id')
        .eq('location_id', location.id).eq('source', 'ghl_user').eq('is_active', true)
        .not('ghl_user_id', 'in', `(${ghlUserIds.join(',')})`);
      for (const s of (stale || [])) {
        await supabase.from('employees').update({ is_active: false }).eq('id', s.id);
        syncedUsers.push({ name: s.full_name, action: 'deactivated' });
      }
    }

    await supabase.from('sync_log').insert({ location_id: location.id, event_type: 'ghl_user_sync', direction: 'inbound', payload: { total: ghlUsers.length, synced, skipped }, status: 'success', users_synced: synced });

    return jsonOk({ success: true, message: `Synced ${synced} users${skipped ? `, skipped ${skipped}` : ''}`, synced, skipped, total: ghlUsers.length, users: syncedUsers, errors: errors.length ? errors : undefined });
  } catch (err: any) {
    return jsonError(`Sync failed: ${err.message}`, 500);
  }
}
