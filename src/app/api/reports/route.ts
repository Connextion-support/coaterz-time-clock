import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getSunday, getSaturday, jsonOk, jsonError, formatPhone, resolveLocation } from '@/lib/helpers';

// GET /api/reports?locationId=xxx&period=current_week&format=json|csv
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);

  const ghlLocId = searchParams.get('locationId') || '';
  if (!ghlLocId) return jsonError('locationId required', 400);
  const location = await resolveLocation(ghlLocId);
  if (!location) return jsonError('Location not found', 404);

  const period = searchParams.get('period') || 'current_week';
  const format = searchParams.get('format') || 'json';
  const employeeFilter = searchParams.get('employee_id');
  const otThreshold = location.overtime_threshold || 40;

  const now = new Date();
  let start: Date, end: Date;
  if (period === 'last_week') { const lw = new Date(now); lw.setDate(lw.getDate()-7); start = getSunday(lw); end = getSaturday(lw); }
  else if (period === 'custom') { const s = searchParams.get('start'), e = searchParams.get('end'); if (!s||!e) return jsonError('start/end required',400); start = new Date(s+'T00:00:00'); end = new Date(e+'T23:59:59'); }
  else { start = getSunday(now); end = getSaturday(now); }

  let query = supabase.from('time_entries').select('*, employees!inner(id,phone,full_name,department,hourly_rate)')
    .eq('location_id', location.id).gte('clock_in', start.toISOString()).lte('clock_in', end.toISOString()).order('clock_in');
  if (employeeFilter) query = query.eq('employee_id', employeeFilter);

  const { data: entries, error } = await query;
  if (error) return jsonError(error.message, 500);

  // Group by employee
  const grouped: Record<string, any> = {};
  (entries || []).forEach((e: any) => {
    const emp = e.employees; const eid = emp.id;
    if (!grouped[eid]) grouped[eid] = { employeeId:eid, fullName:emp.full_name, phone:emp.phone, department:emp.department||'', hourlyRate:emp.hourly_rate, entries:[], totalHours:0, regularHours:0, overtimeHours:0, grossPay:0 };
    grouped[eid].entries.push({ id:e.id, date:e.clock_in, clockIn:e.clock_in, clockOut:e.clock_out, hoursWorked:e.hours_worked, workOrder:e.work_order });
    if (e.hours_worked) grouped[eid].totalHours += parseFloat(e.hours_worked);
  });

  const groups = Object.values(grouped).map((g: any) => {
    g.totalHours = Math.round(g.totalHours*100)/100;
    g.regularHours = Math.round(Math.min(g.totalHours, otThreshold)*100)/100;
    g.overtimeHours = Math.round(Math.max(0, g.totalHours - otThreshold)*100)/100;
    if (g.hourlyRate) g.grossPay = Math.round((g.regularHours * g.hourlyRate + g.overtimeHours * g.hourlyRate * 1.5)*100)/100;
    return g;
  }).sort((a: any,b: any) => a.fullName.localeCompare(b.fullName));

  if (format === 'csv') {
    const rows: string[][] = [['Full Name','Employee ID (Phone)','Department','Hourly Rate','Date','Clock In','Clock Out','Hours Worked','Work Order','Regular Hrs','OT Hrs','Gross Pay']];
    groups.forEach((g: any) => {
      g.entries.forEach((e: any, i: number) => {
        const ci = new Date(e.clockIn); const co = e.clockOut ? new Date(e.clockOut) : null;
        rows.push([g.fullName, formatPhone(g.phone), g.department, g.hourlyRate?`$${g.hourlyRate.toFixed(2)}`:'',
          ci.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}),
          ci.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}),
          co?co.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true}):'ACTIVE',
          e.hoursWorked?e.hoursWorked.toFixed(2):'', e.workOrder||'',
          i===0?g.regularHours.toFixed(2):'', i===0?g.overtimeHours.toFixed(2):'',
          i===0&&g.grossPay?`$${g.grossPay.toFixed(2)}`:'' ]);
      });
      rows.push(['','','','','','',`TOTAL: ${g.fullName}`,'',`${g.totalHours.toFixed(2)} hrs`,'',g.overtimeHours>0?`${g.overtimeHours.toFixed(2)} OT`:'',g.grossPay?`$${g.grossPay.toFixed(2)}`:'']);
      rows.push([]);
    });
    const csv = rows.map(r => r.map(c => `"${(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    return new Response(csv, { headers: { 'Content-Type':'text/csv','Content-Disposition':`attachment; filename="${location.name}-TimeReport-${start.toISOString().slice(0,10)}-to-${end.toISOString().slice(0,10)}.csv"` }});
  }

  return jsonOk({
    location: { id: location.id, name: location.name },
    period: { start: start.toISOString(), end: end.toISOString(), label: period },
    overtimeThreshold: otThreshold,
    summary: {
      totalEmployees: groups.length,
      totalEntries: groups.reduce((s: number,g: any) => s+g.entries.length, 0),
      totalHours: Math.round(groups.reduce((s: number,g: any) => s+g.totalHours, 0)*100)/100,
      totalOvertimeHours: Math.round(groups.reduce((s: number,g: any) => s+g.overtimeHours, 0)*100)/100,
      totalGrossPay: Math.round(groups.reduce((s: number,g: any) => s+g.grossPay, 0)*100)/100,
    },
    employees: groups,
  });
}
