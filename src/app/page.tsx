'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  return d.length === 11 && d[0] === '1' ? d.slice(1) : d;
}
function formatPhone(p: string): string {
  const d = normalizePhone(p);
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return p;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', second:'2-digit', hour12:true });
}

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div style={{ textAlign:'center', marginBottom:24 }}>
      <div style={{ fontSize:42, fontWeight:700, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.03em', color:'#fff' }}>
        {now.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', second:'2-digit', hour12:true })}
      </div>
      <div style={{ fontSize:13, color:'#9C9589', marginTop:2 }}>
        {now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' })}
      </div>
    </div>
  );
}

export default function ClockPage() {
  const [empInput, setEmpInput] = useState('');
  const [workOrder, setWorkOrder] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [showWorkOrder, setShowWorkOrder] = useState(false);
  const [pendingClockIn, setPendingClockIn] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const empRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<any>(null);
  const debounceRef = useRef<any>(null);

  // Debounced status check
  const checkStatus = useCallback((phone: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const normalized = normalizePhone(phone);
    if (normalized.length < 7) { setStatus(null); return; }

    debounceRef.current = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(`/api/clock?phone=${normalized}`);
        const data = await res.json();
        setStatus(data);
      } catch { setStatus(null); }
      setChecking(false);
    }, 400);
  }, []);

  const clearFeedback = (ms = 4500) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setFeedback(null); empRef.current?.focus(); }, ms);
  };

  const handleClockAction = async (forceClockIn = false) => {
    const phone = normalizePhone(empInput);
    if (!phone || phone.length < 7) {
      setFeedback({ type:'error', message:'Enter your Employee ID / Phone #', detail:'' });
      clearFeedback(2500);
      return;
    }

    // If not yet showing work order and employee is NOT clocked in, show it first
    if (!forceClockIn && !pendingClockIn && status && !status.clockedIn) {
      setPendingClockIn(true);
      setShowWorkOrder(true);
      return;
    }

    try {
      const res = await fetch('/api/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, workOrder: workOrder.trim() || undefined }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFeedback({ type:'error', message: data.error || 'Error', detail:'' });
        clearFeedback(3000);
        return;
      }

      if (data.action === 'clock_in') {
        setFeedback({
          type: 'in',
          message: 'Clocked In',
          detail: `${data.employee.fullName} • ${fmtTime(data.entry.clock_in)}${data.entry.work_order ? ` • WO: ${data.entry.work_order}` : ''}`,
        });
      } else {
        setFeedback({
          type: 'out',
          message: 'Clocked Out',
          detail: `${data.employee.fullName} • ${data.hoursWorked?.toFixed(2)} hrs`,
        });
      }

      setEmpInput('');
      setWorkOrder('');
      setShowWorkOrder(false);
      setPendingClockIn(false);
      setStatus(null);
      clearFeedback();
    } catch (err) {
      setFeedback({ type:'error', message:'Connection error', detail:'Please try again' });
      clearFeedback(3000);
    }
  };

  const isClockedIn = status?.clockedIn;
  const empName = status?.employee?.fullName;

  return (
    <div style={{ minHeight:'100vh', display:'flex', justifyContent:'center', padding:'20px 16px' }}>
      <div style={{ width:'100%', maxWidth:460, display:'flex', flexDirection:'column', alignItems:'center' }}>
        {/* Brand */}
        <div style={{ textAlign:'center', paddingTop:24, marginBottom:8 }}>
          <h1 style={{ fontSize:28, fontWeight:800, margin:0, letterSpacing:'0.08em', color:'#fff', fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif" }}>COATERZ</h1>
          <div style={{ fontSize:10, fontWeight:600, color:'#F07B1A', letterSpacing:'0.22em', marginTop:-2 }}>THE GOLD STANDARD</div>
        </div>

        <div style={{ width:'100%', background:'#2A2A2A', border:'1px solid #3D3D3D', borderRadius:16, padding:'28px 28px 32px', marginTop:16 }}>
          <LiveClock />

          {/* Feedback */}
          {feedback && (
            <div style={{
              display:'flex', alignItems:'center', gap:14, padding:'18px 20px', borderRadius:10,
              animation:'fadeIn .3s ease',
              background: feedback.type === 'in' ? 'rgba(74,222,128,0.10)' : feedback.type === 'out' ? 'rgba(248,113,113,0.10)' : 'rgba(251,191,36,0.08)',
              border: `1px solid ${feedback.type === 'in' ? 'rgba(74,222,128,0.25)' : feedback.type === 'out' ? 'rgba(248,113,113,0.25)' : 'rgba(251,191,36,0.25)'}`,
            }}>
              <div style={{ fontSize:24, fontWeight:800, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, background:'rgba(255,255,255,0.06)' }}>
                {feedback.type === 'in' ? '✓' : feedback.type === 'out' ? '■' : '!'}
              </div>
              <div>
                <div style={{ fontSize:18, fontWeight:700 }}>{feedback.message}</div>
                {feedback.detail && <div style={{ fontSize:12, color:'#9C9589', marginTop:3 }}>{feedback.detail}</div>}
              </div>
            </div>
          )}

          {/* Input */}
          {!feedback && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#9C9589', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                Employee ID / Phone Number
              </label>
              <input
                ref={empRef}
                type="tel"
                value={empInput}
                onChange={e => {
                  setEmpInput(e.target.value);
                  checkStatus(e.target.value);
                  if (pendingClockIn) { setPendingClockIn(false); setShowWorkOrder(false); }
                }}
                onKeyDown={e => { if (e.key === 'Enter' && !showWorkOrder) handleClockAction(); }}
                placeholder="(555) 123-4567"
                style={{ width:'100%', padding:'13px 16px', fontSize:17, fontFamily:"'Barlow',system-ui,sans-serif", fontWeight:500, background:'#242424', border:'1.5px solid #3D3D3D', borderRadius:10, color:'#F0ECE6', outline:'none', boxSizing:'border-box' }}
                autoFocus
              />

              {/* Status */}
              {normalizePhone(empInput).length >= 7 && status && (
                <div style={{
                  display:'flex', alignItems:'center', gap:8, fontSize:13, padding:'8px 14px', borderRadius:99, fontWeight:500, animation:'fadeIn .2s ease',
                  background: isClockedIn ? 'rgba(74,222,128,0.10)' : empName ? 'rgba(240,123,26,0.12)' : 'rgba(255,255,255,0.03)',
                  color: isClockedIn ? '#4ADE80' : empName ? '#F59D42' : '#9C9589',
                }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background: isClockedIn ? '#4ADE80' : empName ? '#F07B1A' : '#9C9589' }} />
                  {checking ? 'Checking...'
                    : isClockedIn ? `${empName || formatPhone(status.employee.phone)} — clocked in`
                    : empName ? empName
                    : 'Employee not registered — contact your admin'
                  }
                </div>
              )}

              {/* Work Order */}
              {showWorkOrder && !isClockedIn && (
                <div style={{ animation:'fadeIn .2s ease' }}>
                  <label style={{ fontSize:11, fontWeight:700, color:'#9C9589', textTransform:'uppercase', letterSpacing:'0.08em' }}>
                    Work Order / Job # <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, opacity:0.5, fontSize:10, marginLeft:4 }}>Optional</span>
                  </label>
                  <input
                    type="text" value={workOrder} onChange={e => setWorkOrder(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleClockAction(true); }}
                    placeholder="e.g. WO-1042"
                    style={{ width:'100%', padding:'13px 16px', fontSize:17, fontFamily:"'Barlow',system-ui,sans-serif", fontWeight:500, background:'#242424', border:'1.5px solid #3D3D3D', borderRadius:10, color:'#F0ECE6', outline:'none', boxSizing:'border-box', marginTop:6 }}
                    autoFocus
                  />
                </div>
              )}

              {/* Action */}
              <button
                onClick={() => handleClockAction(pendingClockIn)}
                style={{
                  width:'100%', padding:'15px', fontSize:16, fontWeight:800, fontFamily:"'Barlow Condensed','Barlow',system-ui,sans-serif",
                  border:'none', borderRadius:10, letterSpacing:'0.08em', textTransform:'uppercase', marginTop:6, color:'#fff',
                  background: isClockedIn ? '#F87171' : '#F07B1A',
                }}
              >
                {isClockedIn ? 'CLOCK OUT' : showWorkOrder ? 'CLOCK IN' : 'CONTINUE'}
              </button>

              {showWorkOrder && !isClockedIn && (
                <button onClick={() => handleClockAction(true)}
                  style={{ background:'none', border:'none', color:'#9C9589', fontSize:12, fontFamily:"'Barlow',system-ui,sans-serif", textDecoration:'underline', textUnderlineOffset:3, padding:'4px 0' }}>
                  Skip — Clock in without work order
                </button>
              )}
            </div>
          )}
        </div>

        <a href="/admin" style={{ background:'none', border:'none', color:'#9C9589', fontSize:12, marginTop:32, opacity:0.5, textDecoration:'none' }}>
          Admin Panel →
        </a>
      </div>
    </div>
  );
}
