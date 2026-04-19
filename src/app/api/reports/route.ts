import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getSunday, getSaturday, jsonOk, jsonError, formatPhone } from '@/lib/helpers';

// ── GET /api/reports ──
// Query params:
//   period: "current_week" | "last_week" | "custom"
//   start: "2025-01-05" (required if period=custom)
//   end:   "2025-01-11" (required if period=custom)
//   employee_id: UUID (optional, filter to one employee)
//   format: "json" | "csv" (default: json)
//   overtime_threshold: number (default: 40)

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { searchParams } = new URL(request.url);

  const period = searchParams.get('period') || 'current_week';
  const format = searchParams.get('format') || 'json';
  const employeeFilter = searchParams.get('employee_id');
  const otThreshold = parseFloat(searchParams.get('overtime_threshold') || '40');

  // ── Determine date range ──
  const now = new Date();
  let start: Date, end: Date;

  if (period === 'last_week') {
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 7);
    start = getSunday(lastWeek);
    end = getSaturday(lastWeek);
  } else if (period === 'custom') {
    const startStr = searchParams.get('start');
    const endStr = searchParams.get('end');
    if (!startStr || !endStr) return jsonError('start and end dates required for custom period', 400);
    start = new Date(startStr + 'T00:00:00');
    end = new Date(endStr + 'T23:59:59');
  } else {
    start = getSunday(now);
    end = getSaturday(now);
  }

  // ── Fetch entries with employee data ──
  let query = supabase
    .from('time_entries')
    .select(`
      *,
      employees!inner (
        id, phone, full_name, department, hourly_rate
      )
    `)
    .gte('clock_in', start.toISOString())
    .lte('clock_in', end.toISOString())
    .order('clock_in', { ascending: true });

  if (employeeFilter) {
    query = query.eq('employee_id', employeeFilter);
  }

  const { data: entries, error } = await query;
  if (error) return jsonError(error.message, 500);

  // ── Group by employee ──
  const grouped: Record<string, any> = {};

  (entries || []).forEach((entry: any) => {
    const emp = entry.employees;
    const empId = emp.id;

    if (!grouped[empId]) {
      grouped[empId] = {
        employeeId: empId,
        fullName: emp.full_name,
        phone: emp.phone,
        department: emp.department || '',
        hourlyRate: emp.hourly_rate,
        entries: [],
        totalHours: 0,
        regularHours: 0,
        overtimeHours: 0,
        grossPay: 0,
      };
    }

    grouped[empId].entries.push({
      id: entry.id,
      date: entry.clock_in,
      clockIn: entry.clock_in,
      clockOut: entry.clock_out,
      hoursWorked: entry.hours_worked,
      workOrder: entry.work_order,
      notes: entry.notes,
      isManual: entry.is_manual,
    });

    if (entry.hours_worked) {
      grouped[empId].totalHours += parseFloat(entry.hours_worked);
    }
  });

  // ── Calculate overtime & pay ──
  const groups = Object.values(grouped).map((g: any) => {
    g.totalHours = Math.round(g.totalHours * 100) / 100;
    g.regularHours = Math.round(Math.min(g.totalHours, otThreshold) * 100) / 100;
    g.overtimeHours = Math.round(Math.max(0, g.totalHours - otThreshold) * 100) / 100;

    if (g.hourlyRate) {
      g.grossPay = Math.round(
        (g.regularHours * g.hourlyRate + g.overtimeHours * g.hourlyRate * 1.5) * 100
      ) / 100;
    }

    return g;
  });

  groups.sort((a: any, b: any) => a.fullName.localeCompare(b.fullName));

  // ── CSV FORMAT ──
  if (format === 'csv') {
    const rows: string[][] = [
      ['Full Name', 'Employee ID (Phone)', 'Department', 'Hourly Rate', 'Date', 'Clock In', 'Clock Out', 'Hours Worked', 'Work Order', 'Regular Hrs (Period)', 'OT Hrs (Period)', 'Gross Pay (Period)'],
    ];

    groups.forEach((g: any) => {
      g.entries.forEach((e: any, i: number) => {
        const clockInDate = new Date(e.clockIn);
        const clockOutDate = e.clockOut ? new Date(e.clockOut) : null;

        rows.push([
          g.fullName,
          formatPhone(g.phone),
          g.department,
          g.hourlyRate ? `$${g.hourlyRate.toFixed(2)}` : '',
          clockInDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
          clockInDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          clockOutDate
            ? clockOutDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
            : 'ACTIVE',
          e.hoursWorked ? e.hoursWorked.toFixed(2) : '',
          e.workOrder || '',
          i === 0 ? g.regularHours.toFixed(2) : '',
          i === 0 ? g.overtimeHours.toFixed(2) : '',
          i === 0 && g.grossPay ? `$${g.grossPay.toFixed(2)}` : '',
        ]);
      });

      // Summary row
      rows.push([
        '', '', '', '', '', '',
        `TOTAL: ${g.fullName}`,
        '',
        `${g.totalHours.toFixed(2)} hrs`,
        '',
        g.overtimeHours > 0 ? `${g.overtimeHours.toFixed(2)} OT` : '',
        g.grossPay ? `$${g.grossPay.toFixed(2)}` : '',
      ]);
      rows.push([]); // blank separator
    });

    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="CoaterZ-TimeReport-${start.toISOString().slice(0, 10)}-to-${end.toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // ── JSON FORMAT ──
  return jsonOk({
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      label: period,
    },
    overtimeThreshold: otThreshold,
    summary: {
      totalEmployees: groups.length,
      totalEntries: groups.reduce((s: number, g: any) => s + g.entries.length, 0),
      totalHours: Math.round(groups.reduce((s: number, g: any) => s + g.totalHours, 0) * 100) / 100,
      totalOvertimeHours: Math.round(groups.reduce((s: number, g: any) => s + g.overtimeHours, 0) * 100) / 100,
      totalGrossPay: Math.round(groups.reduce((s: number, g: any) => s + g.grossPay, 0) * 100) / 100,
    },
    employees: groups,
  });
}
