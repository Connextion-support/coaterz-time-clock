'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

// ── Helpers ──
const normalizePhone = (r: string) => { const d = r.replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d; };
const formatPhone = (p: string) => { const d = normalizePhone(p); return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : p; };
const fmtTime = (iso: string) => iso ? new Date(iso).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true }) : '—';
const fmtDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—';
const fmtDateShort = (iso: string) => iso ? new Date(iso).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) : '—';

const C = {
  orange:'#F07B1A', orangeLight:'#F59D42', orangeGlow:'rgba(240,123,26,0.12)', orangeBorder:'rgba(240,123,26,0.3)',
  surface:'#2A2A2A', charcoal:'#242424', border:'#3D3D3D', text:'#F0ECE6', muted:'#9C9589',
  green:'#4ADE80', greenGlow:'rgba(74,222,128,0.10)', greenBorder:'rgba(74,222,128,0.25)',
  red:'#F87171', redGlow:'rgba(248,113,113,0.10)',
};

export default function AdminPage() {
  const [auth, setAuth] = useState(false);
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [employees, setEmployees] = useState<any[]>([]);
  const [reportData, setReportData] = useState<any>(null);
  const [activeEntries, setActiveEntries] = useState<any[]>([]);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Report filters
  const [period, setPeriod] = useState('current_week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterEmp, setFilterEmp] = useState('');

  // Employee form
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState<any>(null);
  const [empForm, setEmpForm] = useState({ fullName:'', phone:'', department:'', hourlyRate:'', notes:'' });

  // ── Auth ──
  const handleLogin = async () => {
    try {
      const res = await fetch('/api/auth', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) { setAuth(true); setToken(data.token); }
      else alert('Invalid password');
    } catch { alert('Connection error'); }
  };

  const authHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-api-key': token,
  }), [token]);

  // ── Load data ──
  const loadEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees');
      const data = await res.json();
      setEmployees(data.employees || []);
    } catch {}
  }, []);

  const loadDashboard = useCallback(async () => {
    await loadEmployees();
    // Load recent entries via reports API (current week)
    try {
      const res = await fetch('/api/reports?period=current_week');
      const data = await res.json();
      setReportData(data);

      // Extract active entries
      const active: any[] = [];
      const recent: any[] = [];
      (data.employees || []).forEach((g: any) => {
        g.entries.forEach((e: any) => {
          if (!e.clockOut) active.push({ ...e, fullName: g.fullName, phone: g.phone, department: g.department });
          recent.push({ ...e, fullName: g.fullName, phone: g.phone });
        });
      });
      setActiveEntries(active);
      setRecentEntries(recent.sort((a,b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime()).slice(0, 20));
    } catch {}
  }, [loadEmployees]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    let url = `/api/reports?period=${period}`;
    if (period === 'custom' && customStart && customEnd) url += `&start=${customStart}&end=${customEnd}`;
    if (filterEmp) url += `&employee_id=${filterEmp}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      setReportData(data);
    } catch {}
    setLoading(false);
  }, [period, customStart, customEnd, filterEmp]);

  useEffect(() => { if (auth) loadDashboard(); }, [auth, loadDashboard]);
  useEffect(() => { if (auth && tab === 'reports') loadReport(); }, [auth, tab, period, customStart, customEnd, filterEmp, loadReport]);
  useEffect(() => { if (auth && tab === 'employees') loadEmployees(); }, [auth, tab, loadEmployees]);

  // ── Employee CRUD ──
  const saveEmployee = async () => {
    const phone = normalizePhone(empForm.phone);
    if (!phone || !empForm.fullName.trim()) return alert('Name and phone required');

    if (editingEmp) {
      await fetch('/api/employees', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ id: editingEmp.id, fullName: empForm.fullName, phone, department: empForm.department, hourlyRate: empForm.hourlyRate || null, notes: empForm.notes }),
      });
    } else {
      await fetch('/api/employees', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ fullName: empForm.fullName, phone, department: empForm.department, hourlyRate: empForm.hourlyRate || undefined, notes: empForm.notes }),
      });
    }
    setShowEmpForm(false); setEditingEmp(null);
    setEmpForm({ fullName:'', phone:'', department:'', hourlyRate:'', notes:'' });
    loadEmployees();
  };

  const deleteEmployee = async (id: string) => {
    if (!confirm('Deactivate this employee?')) return;
    await fetch(`/api/employees?id=${id}`, { method: 'DELETE', headers: authHeaders() });
    loadEmployees();
  };

  // ── CSV Export ──
  const exportCSV = () => {
    let url = `/api/reports?period=${period}&format=csv`;
    if (period === 'custom' && customStart && customEnd) url += `&start=${customStart}&end=${customEnd}`;
    if (filterEmp) url += `&employee_id=${filterEmp}`;
    window.open(url, '_blank');
  };

  // ── Shared styles ──
  const input: React.CSSProperties = { width:'100%', padding:'11px 14px', fontSize:14, fontFamily:"'Barlow',system-ui,sans-serif", background:C.charcoal, border:`1.5px solid ${C.border}`, borderRadius:10, color:C.text, outline:'none', boxSizing:'border-box' };
  const label: React.CSSProperties = { fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:4 };
  const th: React.CSSProperties = { textAlign:'left', padding:'11px 14px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.muted, background:C.surface, borderBottom:`1px solid ${C.border}` };
  const td: React.CSSProperties = { padding:'11px 14px', verticalAlign:'middle', borderBottom:`1px solid ${C.border}` };

  // ═══════════════════════════════════════
  //  AUTH SCREEN
  // ═══════════════════════════════════════
  if (!auth) return (
    <div style={{ minHeight:'100vh', display:'flex', justifyContent:'center', padding:'20px 16px' }}>
      <div style={{ width:'100%', maxWidth:400, paddingTop:60, display:'flex', flexDirection:'column', gap:12 }}>
        <a href="/" style={{ color:C.orange, fontSize:13, textDecoration:'none' }}>← Back to Clock</a>
        <h2 style={{ fontSize:22, fontWeight:800, margin:'8px 0', fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>Admin Access</h2>
        <p style={{ color:C.muted, fontSize:14, margin:'0 0 12px' }}>Enter admin password</p>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }}
          placeholder="Password" style={input} autoFocus />
        <button onClick={handleLogin}
          style={{ width:'100%', padding:'15px', fontSize:16, fontWeight:800, fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif", border:'none', borderRadius:10, background:C.orange, color:'#fff', letterSpacing:'0.08em', textTransform:'uppercase', marginTop:4 }}>
          Login
        </button>
      </div>
    </div>
  );

  // ═══════════════════════════════════════
  //  ADMIN PANEL
  // ═══════════════════════════════════════
  const summary = reportData?.summary || { totalEmployees:0, totalEntries:0, totalHours:0, totalOvertimeHours:0, totalGrossPay:0 };
  const groups = reportData?.employees || [];

  return (
    <div style={{ minHeight:'100vh', display:'flex', justifyContent:'center', padding:'20px 16px' }}>
      <div style={{ width:'100%', maxWidth:1060 }}>

        {/* Top bar */}
        <div style={{ display:'flex', flexDirection:'column', gap:12, borderBottom:`1px solid ${C.border}`, paddingBottom:16, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <a href="/" style={{ color:C.orange, fontSize:13, textDecoration:'none' }}>← Clock</a>
            <h2 style={{ fontSize:20, fontWeight:800, margin:0, fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>CoaterZ Admin</h2>
          </div>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
            {['dashboard','employees','reports','settings'].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding:'8px 18px', fontSize:13, fontWeight:600, fontFamily:"'Barlow',system-ui,sans-serif", border:`1px solid ${tab===t?C.orangeBorder:'transparent'}`,
                borderRadius:8, color:tab===t?C.orange:C.muted, background:tab===t?C.orangeGlow:'none',
              }}>
                {t==='dashboard'?'Dashboard':t==='employees'?'Employees':t==='reports'?'Reports & Export':'Settings'}
              </button>
            ))}
          </div>
        </div>

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <div style={{ animation:'fadeIn .25s ease' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
              {[
                { label:'Clocked In Now', val: activeEntries.length, color:C.green },
                { label:'Total Employees', val: employees.length, color:C.orange },
                { label:'Entries This Week', val: summary.totalEntries, color:C.text },
                { label:'Hours This Week', val: summary.totalHours?.toFixed(1) || '0', color:C.orangeLight },
              ].map((s,i) => (
                <div key={i} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:'20px 16px', textAlign:'center' }}>
                  <div style={{ fontSize:28, fontWeight:800, fontVariantNumeric:'tabular-nums', color:s.color, fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>{s.val}</div>
                  <div style={{ fontSize:10, color:C.muted, marginTop:4, textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {activeEntries.length > 0 && (
              <>
                <h3 style={{ fontSize:15, fontWeight:700, margin:'0 0 10px', textTransform:'uppercase', letterSpacing:'0.02em', fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>Currently Clocked In</h3>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:24 }}>
                  {activeEntries.map((s,i) => (
                    <div key={i} style={{ background:C.greenGlow, border:`1px solid ${C.greenBorder}`, borderRadius:10, padding:'14px 18px', minWidth:160 }}>
                      <div style={{ fontWeight:700, fontSize:15 }}>{s.fullName}</div>
                      <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{formatPhone(s.phone)}</div>
                      <div style={{ fontSize:12, color:C.green, marginTop:4 }}>Since {fmtTime(s.clockIn)}</div>
                      {s.workOrder && <div style={{ fontSize:11, color:C.orange, marginTop:3 }}>WO: {s.workOrder}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}

            <h3 style={{ fontSize:15, fontWeight:700, margin:'0 0 10px', textTransform:'uppercase', letterSpacing:'0.02em', fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>Recent Activity</h3>
            <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${C.border}` }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead><tr>{['Employee','Date','In','Out','Hours','Work Order'].map((h,i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {recentEntries.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign:'center', padding:30, color:C.muted }}>No entries yet</td></tr>}
                  {recentEntries.map((e,i) => (
                    <tr key={i}>
                      <td style={td}><span style={{ background:C.orangeGlow, color:C.orange, padding:'3px 10px', borderRadius:6, fontWeight:600, fontSize:12, whiteSpace:'nowrap' }}>{e.fullName}</span></td>
                      <td style={td}>{fmtDate(e.clockIn)}</td>
                      <td style={td}>{fmtTime(e.clockIn)}</td>
                      <td style={td}>{e.clockOut ? fmtTime(e.clockOut) : <span style={{ color:C.green, fontWeight:600 }}>Active</span>}</td>
                      <td style={td}>{e.hoursWorked ? parseFloat(e.hoursWorked).toFixed(2) : '—'}</td>
                      <td style={td}>{e.workOrder || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── EMPLOYEES ── */}
        {tab === 'employees' && (
          <div style={{ animation:'fadeIn .25s ease' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ fontSize:15, fontWeight:700, margin:0, textTransform:'uppercase', fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>Employee Directory</h3>
              <button onClick={() => { setShowEmpForm(true); setEditingEmp(null); setEmpForm({ fullName:'', phone:'', department:'', hourlyRate:'', notes:'' }); }}
                style={{ padding:'9px 20px', fontSize:13, fontWeight:700, fontFamily:"'Barlow',system-ui,sans-serif", background:C.orange, color:'#fff', border:'none', borderRadius:8 }}>
                + Add Employee
              </button>
            </div>
            <p style={{ fontSize:13, color:C.muted, margin:'0 0 16px' }}>
              Employees can also be added automatically via GHL webhook. See Settings tab.
            </p>

            {/* Form modal */}
            {showEmpForm && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
                <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:'28px 30px', maxWidth:540, width:'100%' }}>
                  <h3 style={{ fontSize:18, fontWeight:700, margin:'0 0 20px', color:C.text }}>{editingEmp ? 'Edit Employee' : 'Add Employee'}</h3>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 16px' }}>
                    <div><label style={label}>Full Name *</label><input value={empForm.fullName} onChange={e => setEmpForm({...empForm, fullName:e.target.value})} style={input} placeholder="John Smith" /></div>
                    <div><label style={label}>Phone (Employee ID) *</label><input value={empForm.phone} onChange={e => setEmpForm({...empForm, phone:e.target.value})} style={input} placeholder="(555) 123-4567" type="tel" /></div>
                    <div><label style={label}>Department / Crew</label><input value={empForm.department} onChange={e => setEmpForm({...empForm, department:e.target.value})} style={input} placeholder="Crew A" /></div>
                    <div><label style={label}>Hourly Rate ($)</label><input value={empForm.hourlyRate} onChange={e => setEmpForm({...empForm, hourlyRate:e.target.value})} style={input} placeholder="0.00" type="number" step="0.01" /></div>
                  </div>
                  <div style={{ marginTop:12 }}><label style={label}>Notes</label><input value={empForm.notes} onChange={e => setEmpForm({...empForm, notes:e.target.value})} style={input} placeholder="Notes" /></div>
                  <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:20 }}>
                    <button onClick={() => setShowEmpForm(false)} style={{ padding:'10px 20px', background:'none', border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, fontFamily:"'Barlow',system-ui,sans-serif", fontSize:13 }}>Cancel</button>
                    <button onClick={saveEmployee} style={{ padding:'10px 28px', fontSize:14, fontWeight:800, fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif", border:'none', borderRadius:10, background:C.orange, color:'#fff', letterSpacing:'0.04em' }}>Save</button>
                  </div>
                </div>
              </div>
            )}

            <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${C.border}` }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead><tr>{['Name','Phone / ID','Department','Rate','Added',''].map((h,i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {employees.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign:'center', padding:30, color:C.muted }}>No employees yet</td></tr>}
                  {employees.map((emp: any) => (
                    <tr key={emp.id}>
                      <td style={{ ...td, fontWeight:600 }}>{emp.full_name}</td>
                      <td style={td}>{formatPhone(emp.phone)}</td>
                      <td style={td}>{emp.department || '—'}</td>
                      <td style={td}>{emp.hourly_rate ? `$${parseFloat(emp.hourly_rate).toFixed(2)}` : '—'}</td>
                      <td style={td}>{fmtDate(emp.created_at)}</td>
                      <td style={td}>
                        <button onClick={() => { setEditingEmp(emp); setEmpForm({ fullName:emp.full_name, phone:emp.phone, department:emp.department||'', hourlyRate:emp.hourly_rate||'', notes:emp.notes||'' }); setShowEmpForm(true); }}
                          style={{ background:'none', border:'none', color:C.orange, fontSize:14, opacity:0.6, marginRight:8, cursor:'pointer' }}>✎</button>
                        <button onClick={() => deleteEmployee(emp.id)}
                          style={{ background:'none', border:'none', color:C.muted, fontSize:14, opacity:0.4, cursor:'pointer' }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── REPORTS ── */}
        {tab === 'reports' && (
          <div style={{ animation:'fadeIn .25s ease' }}>
            <h3 style={{ fontSize:15, fontWeight:700, margin:'0 0 14px', textTransform:'uppercase', fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>Time Report & Export</h3>

            <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginBottom:16, alignItems:'flex-end' }}>
              <div>
                <label style={label}>Period</label>
                <select value={period} onChange={e => setPeriod(e.target.value)} style={{ ...input, width:'auto', minWidth:200 }}>
                  <option value="current_week">Current Week (Sun–Sat)</option>
                  <option value="last_week">Last Week</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
              {period === 'custom' && (
                <>
                  <div><label style={label}>Start</label><input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={input} /></div>
                  <div><label style={label}>End</label><input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={input} /></div>
                </>
              )}
              <div>
                <label style={label}>Employee</label>
                <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} style={{ ...input, width:'auto', minWidth:180 }}>
                  <option value="">All Employees</option>
                  {employees.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </div>
              <button onClick={exportCSV} style={{ padding:'11px 24px', fontSize:14, fontWeight:700, fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif", background:C.orange, color:'#fff', border:'none', borderRadius:8, letterSpacing:'0.04em', textTransform:'uppercase', whiteSpace:'nowrap' }}>
                ↓ Export CSV
              </button>
            </div>

            {reportData?.period && (
              <div style={{ fontSize:14, fontWeight:600, color:C.muted, marginBottom:16, padding:'8px 14px', background:C.surface, borderRadius:8, display:'inline-block', border:`1px solid ${C.border}` }}>
                {fmtDate(reportData.period.start)} — {fmtDate(reportData.period.end)}
                {summary.totalHours > 0 && <span style={{ marginLeft:16, color:C.text }}>{summary.totalHours.toFixed(1)} total hrs</span>}
                {summary.totalGrossPay > 0 && <span style={{ marginLeft:16, color:C.green }}>${summary.totalGrossPay.toFixed(2)} gross</span>}
              </div>
            )}

            {loading && <div style={{ textAlign:'center', padding:40, color:C.muted }}>Loading...</div>}

            {!loading && groups.length === 0 && (
              <div style={{ textAlign:'center', padding:40, color:C.muted }}>No entries for this period</div>
            )}

            {!loading && groups.map((g: any) => (
              <div key={g.employeeId} style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, marginBottom:16, overflow:'hidden' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 20px', borderBottom:`1px solid ${C.border}`, flexWrap:'wrap', gap:12 }}>
                  <div>
                    <span style={{ fontSize:16, fontWeight:700, marginRight:10 }}>{g.fullName}</span>
                    <span style={{ fontSize:12, color:C.muted, marginRight:10 }}>{formatPhone(g.phone)}</span>
                    {g.department && <span style={{ fontSize:11, color:C.orange, background:C.orangeGlow, padding:'2px 8px', borderRadius:4 }}>{g.department}</span>}
                  </div>
                  <div style={{ display:'flex', gap:20 }}>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ display:'block', fontSize:18, fontWeight:800, fontVariantNumeric:'tabular-nums', fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>{g.totalHours.toFixed(2)}</span>
                      <span style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:'0.04em' }}>Total Hrs</span>
                    </div>
                    {g.overtimeHours > 0 && (
                      <div style={{ textAlign:'right', color:C.red }}>
                        <span style={{ display:'block', fontSize:18, fontWeight:800, fontVariantNumeric:'tabular-nums', fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>{g.overtimeHours.toFixed(2)}</span>
                        <span style={{ fontSize:10, textTransform:'uppercase', letterSpacing:'0.04em' }}>OT Hrs</span>
                      </div>
                    )}
                    {g.grossPay > 0 && (
                      <div style={{ textAlign:'right' }}>
                        <span style={{ display:'block', fontSize:18, fontWeight:800, fontVariantNumeric:'tabular-nums', fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif", color:C.green }}>${g.grossPay.toFixed(2)}</span>
                        <span style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:'0.04em' }}>Gross Pay</span>
                      </div>
                    )}
                  </div>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead><tr>{['Date','Clock In','Clock Out','Hours','Work Order'].map((h,i) => <th key={i} style={{ ...th, fontSize:10, padding:'8px 12px' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {g.entries.map((e: any) => (
                      <tr key={e.id}>
                        <td style={td}>{fmtDateShort(e.clockIn)}</td>
                        <td style={td}>{fmtTime(e.clockIn)}</td>
                        <td style={td}>{e.clockOut ? fmtTime(e.clockOut) : <span style={{ color:C.green }}>Active</span>}</td>
                        <td style={{ ...td, fontWeight:600 }}>{e.hoursWorked ? parseFloat(e.hoursWorked).toFixed(2) : '—'}</td>
                        <td style={td}>{e.workOrder || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <div style={{ animation:'fadeIn .25s ease' }}>
            <h3 style={{ fontSize:15, fontWeight:700, margin:'0 0 14px', textTransform:'uppercase', fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>Settings & GHL Integration</h3>

            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:'20px 24px' }}>
                <h4 style={{ fontSize:15, fontWeight:700, margin:'0 0 8px', color:C.orange, fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>GHL Webhook — Send Employees INTO This System</h4>
                <p style={{ fontSize:13, color:C.muted, margin:'0 0 12px', lineHeight:1.6 }}>
                  Create a GHL Workflow that fires when an employee contact is created or tagged. Use an HTTP Request action to POST to:
                </p>
                <div style={{ fontSize:13, color:C.text, background:C.charcoal, borderRadius:8, padding:'12px 16px', fontFamily:"'JetBrains Mono','Fira Code',monospace", border:`1px solid ${C.border}`, wordBreak:'break-all' }}>
                  POST https://YOUR-DOMAIN.vercel.app/api/webhook
                </div>
                <div style={{ fontSize:12, color:C.muted, background:C.charcoal, borderRadius:8, padding:'12px 16px', marginTop:8, lineHeight:1.8, fontFamily:"'JetBrains Mono','Fira Code',monospace", border:`1px solid ${C.border}`, wordBreak:'break-all' }}>
                  {`{`}<br/>
                  {`  "fullName": "{{contact.name}}",`}<br/>
                  {`  "phone": "{{contact.phone}}",`}<br/>
                  {`  "department": "{{contact.custom_field.department}}",`}<br/>
                  {`  "hourlyRate": "{{contact.custom_field.hourly_rate}}",`}<br/>
                  {`  "ghlContactId": "{{contact.id}}"`}<br/>
                  {`}`}
                </div>
                <p style={{ fontSize:12, color:C.muted, marginTop:8, lineHeight:1.5 }}>
                  Replace the custom field keys with your actual GHL custom value names. The endpoint accepts flexible field names (fullName, name, first_name + last_name, etc).
                </p>
              </div>

              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:'20px 24px' }}>
                <h4 style={{ fontSize:15, fontWeight:700, margin:'0 0 8px', color:C.orange, fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>GHL Webhook — Send Clock Events TO GHL</h4>
                <p style={{ fontSize:13, color:C.muted, margin:'0 0 12px', lineHeight:1.6 }}>
                  Set the <code>GHL_WEBHOOK_URL</code> environment variable in your Vercel dashboard to your GHL Inbound Webhook URL. Every clock-in and clock-out will POST a payload there.
                </p>
                <div style={{ fontSize:12, color:C.muted, background:C.charcoal, borderRadius:8, padding:'12px 16px', lineHeight:1.8, fontFamily:"'JetBrains Mono','Fira Code',monospace", border:`1px solid ${C.border}`, wordBreak:'break-all' }}>
                  {`{ event, employeeId, fullName, department, clockIn, clockOut, hoursWorked, workOrder, entryId }`}
                </div>
              </div>

              <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:'20px 24px' }}>
                <h4 style={{ fontSize:15, fontWeight:700, margin:'0 0 8px', color:C.orange, fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>API Endpoints Reference</h4>
                <div style={{ fontSize:12, color:C.muted, background:C.charcoal, borderRadius:8, padding:'16px', lineHeight:2, fontFamily:"'JetBrains Mono','Fira Code',monospace", border:`1px solid ${C.border}` }}>
                  <div><span style={{ color:C.green }}>GET</span>  /api/employees — List all employees</div>
                  <div><span style={{ color:C.orange }}>POST</span> /api/employees — Add/update employee</div>
                  <div><span style={{ color:C.green }}>GET</span>  /api/clock?phone=5551234567 — Check status</div>
                  <div><span style={{ color:C.orange }}>POST</span> /api/clock — Clock in/out (auto-detect)</div>
                  <div><span style={{ color:C.orange }}>POST</span> /api/webhook — GHL inbound (add employee)</div>
                  <div><span style={{ color:C.green }}>GET</span>  /api/reports?period=current_week — JSON report</div>
                  <div><span style={{ color:C.green }}>GET</span>  /api/reports?period=current_week&format=csv — CSV download</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
