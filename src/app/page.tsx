'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const normalizePhone = (r: string) => { const d = r.replace(/\D/g,''); return d.length===11&&d[0]==='1'?d.slice(1):d; };
const formatPhone = (p: string) => { const d = normalizePhone(p); return d.length===10?`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`:p; };
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true});

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()),1000); return () => clearInterval(t); }, []);
  return (
    <div style={{ textAlign:'center', marginBottom:24 }}>
      <div style={{ fontSize:42, fontWeight:700, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.03em', color:'#fff' }}>
        {now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true})}
      </div>
      <div style={{ fontSize:13, color:'#9C9589', marginTop:2 }}>
        {now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
      </div>
    </div>
  );
}

function ClockInner() {
  const searchParams = useSearchParams();
  // GHL custom menu links pass locationId, location_id, or companyId as URL params
  const autoLocationId = searchParams.get('locationId') || searchParams.get('location_id') || searchParams.get('companyId') || '';

  const [locationId, setLocationId] = useState(autoLocationId);
  const [locationName, setLocationName] = useState('');
  const [locationVerified, setLocationVerified] = useState(false);
  const [empInput, setEmpInput] = useState('');
  const [workOrder, setWorkOrder] = useState('');
  const [feedback, setFeedback] = useState<any>(null);
  const [showWorkOrder, setShowWorkOrder] = useState(false);
  const [pendingClockIn, setPendingClockIn] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const empRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<any>(null);
  const debounceRef = useRef<any>(null);

  // Verify location on load
  useEffect(() => {
    if (!locationId) return;
    fetch(`/api/employees?locationId=${locationId}`)
      .then(r => r.json())
      .then(data => {
        if (!data.error) { setLocationVerified(true); setLocationName(data.locationName || ''); }
      })
      .catch(() => {});
  }, [locationId]);

  const clearFeedback = (ms = 4500) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setFeedback(null); empRef.current?.focus(); }, ms);
  };

  const checkStatus = useCallback((phone: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const n = normalizePhone(phone);
    if (n.length < 7 || !locationId) { setStatus(null); return; }
    debounceRef.current = setTimeout(async () => {
      try { const r = await fetch(`/api/clock?phone=${n}&locationId=${locationId}`); setStatus(await r.json()); } catch { setStatus(null); }
    }, 400);
  }, [locationId]);

  const handleClockAction = async (forceClockIn = false) => {
    const phone = normalizePhone(empInput);
    if (!phone || phone.length < 7) { setFeedback({type:'error',message:'Enter your Employee ID / Phone #',detail:''}); clearFeedback(2500); return; }
    if (!forceClockIn && !pendingClockIn && status && !status.clockedIn) { setPendingClockIn(true); setShowWorkOrder(true); return; }

    try {
      const res = await fetch('/api/clock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,locationId,workOrder:workOrder.trim()||undefined})});
      const data = await res.json();
      if (!res.ok) { setFeedback({type:'error',message:data.error||'Error',detail:''}); clearFeedback(3000); return; }
      if (data.action==='clock_in') setFeedback({type:'in',message:'Clocked In',detail:`${data.employee.fullName} • ${fmtTime(data.entry.clock_in)}${data.entry.work_order?` • WO: ${data.entry.work_order}`:''}`});
      else setFeedback({type:'out',message:'Clocked Out',detail:`${data.employee.fullName} • ${data.hoursWorked?.toFixed(2)} hrs`});
      setEmpInput(''); setWorkOrder(''); setShowWorkOrder(false); setPendingClockIn(false); setStatus(null); clearFeedback();
    } catch { setFeedback({type:'error',message:'Connection error',detail:''}); clearFeedback(3000); }
  };

  const isClockedIn = status?.clockedIn;
  const empName = status?.employee?.fullName;
  const input: React.CSSProperties = { width:'100%', padding:'13px 16px', fontSize:17, fontFamily:"'Barlow',system-ui,sans-serif", fontWeight:500, background:'#242424', border:'1.5px solid #3D3D3D', borderRadius:10, color:'#F0ECE6', outline:'none', boxSizing:'border-box' };

  // If no location detected, show a manual entry
  if (!locationVerified) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', justifyContent:'center', padding:'20px 16px' }}>
        <div style={{ width:'100%', maxWidth:460, display:'flex', flexDirection:'column', alignItems:'center', paddingTop:60 }}>
          <h1 style={{ fontSize:28, fontWeight:800, letterSpacing:'0.08em', color:'#fff', fontFamily:"'Barlow Condensed',system-ui,sans-serif" }}>COATERZ</h1>
          <div style={{ fontSize:10, fontWeight:600, color:'#F07B1A', letterSpacing:'0.22em', marginBottom:24 }}>THE GOLD STANDARD</div>
          <div style={{ width:'100%', background:'#2A2A2A', border:'1px solid #3D3D3D', borderRadius:16, padding:'28px' }}>
            <p style={{ color:'#9C9589', fontSize:14, marginBottom:16 }}>
              {autoLocationId ? 'Location not found. Please check your configuration.' : 'Enter your company Location ID to continue.'}
            </p>
            <label style={{ fontSize:11, fontWeight:700, color:'#9C9589', textTransform:'uppercase', letterSpacing:'0.08em' }}>GHL Location ID</label>
            <input value={locationId} onChange={e => setLocationId(e.target.value)} placeholder="Enter location ID" style={{...input, marginTop:6}} autoFocus />
            <button onClick={() => { if (locationId) { setLocationVerified(false); window.location.href = `/?locationId=${locationId}`; }}}
              style={{ width:'100%', padding:'15px', fontSize:16, fontWeight:800, fontFamily:"'Barlow Condensed',system-ui,sans-serif", border:'none', borderRadius:10, background:'#F07B1A', color:'#fff', letterSpacing:'0.08em', textTransform:'uppercase', marginTop:12 }}>
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', justifyContent:'center', padding:'20px 16px' }}>
      <div style={{ width:'100%', maxWidth:460, display:'flex', flexDirection:'column', alignItems:'center' }}>
        <div style={{ textAlign:'center', paddingTop:24, marginBottom:8 }}>
          <h1 style={{ fontSize:28, fontWeight:800, margin:0, letterSpacing:'0.08em', color:'#fff', fontFamily:"'Barlow Condensed',system-ui,sans-serif" }}>COATERZ</h1>
          <div style={{ fontSize:10, fontWeight:600, color:'#F07B1A', letterSpacing:'0.22em', marginTop:-2 }}>THE GOLD STANDARD</div>
          {locationName && <div style={{ fontSize:12, color:'#9C9589', marginTop:6 }}>{locationName}</div>}
        </div>

        <div style={{ width:'100%', background:'#2A2A2A', border:'1px solid #3D3D3D', borderRadius:16, padding:'28px 28px 32px', marginTop:16 }}>
          <LiveClock />
          {feedback && (
            <div style={{ display:'flex', alignItems:'center', gap:14, padding:'18px 20px', borderRadius:10, animation:'fadeIn .3s ease',
              background: feedback.type==='in'?'rgba(74,222,128,0.10)':feedback.type==='out'?'rgba(248,113,113,0.10)':'rgba(251,191,36,0.08)',
              border:`1px solid ${feedback.type==='in'?'rgba(74,222,128,0.25)':feedback.type==='out'?'rgba(248,113,113,0.25)':'rgba(251,191,36,0.25)'}` }}>
              <div style={{ fontSize:24, fontWeight:800, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:8, background:'rgba(255,255,255,0.06)' }}>
                {feedback.type==='in'?'✓':feedback.type==='out'?'■':'!'}
              </div>
              <div>
                <div style={{ fontSize:18, fontWeight:700 }}>{feedback.message}</div>
                {feedback.detail && <div style={{ fontSize:12, color:'#9C9589', marginTop:3 }}>{feedback.detail}</div>}
              </div>
            </div>
          )}
          {!feedback && (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <label style={{ fontSize:11, fontWeight:700, color:'#9C9589', textTransform:'uppercase', letterSpacing:'0.08em' }}>Employee ID / Phone Number</label>
              <input ref={empRef} type="tel" value={empInput}
                onChange={e => { setEmpInput(e.target.value); checkStatus(e.target.value); if(pendingClockIn){setPendingClockIn(false);setShowWorkOrder(false);} }}
                onKeyDown={e => { if(e.key==='Enter'&&!showWorkOrder) handleClockAction(); }}
                placeholder="(555) 123-4567" style={input} autoFocus />
              {normalizePhone(empInput).length >= 7 && status && (
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, padding:'8px 14px', borderRadius:99, fontWeight:500, animation:'fadeIn .2s ease',
                  background: isClockedIn?'rgba(74,222,128,0.10)':empName?'rgba(240,123,26,0.12)':'rgba(255,255,255,0.03)',
                  color: isClockedIn?'#4ADE80':empName?'#F59D42':'#9C9589' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:isClockedIn?'#4ADE80':empName?'#F07B1A':'#9C9589' }} />
                  {isClockedIn?`${empName||formatPhone(status.employee.phone)} — clocked in`:empName?empName:'Not registered — contact admin'}
                </div>
              )}
              {showWorkOrder && !isClockedIn && (
                <div style={{ animation:'fadeIn .2s ease' }}>
                  <label style={{ fontSize:11, fontWeight:700, color:'#9C9589', textTransform:'uppercase', letterSpacing:'0.08em' }}>Work Order <span style={{ fontWeight:400, textTransform:'none', opacity:0.5, fontSize:10, marginLeft:4 }}>Optional</span></label>
                  <input type="text" value={workOrder} onChange={e => setWorkOrder(e.target.value)} onKeyDown={e => {if(e.key==='Enter')handleClockAction(true);}}
                    placeholder="e.g. WO-1042" style={{...input,marginTop:6}} autoFocus />
                </div>
              )}
              <button onClick={() => handleClockAction(pendingClockIn)}
                style={{ width:'100%', padding:'15px', fontSize:16, fontWeight:800, fontFamily:"'Barlow Condensed',system-ui,sans-serif", border:'none', borderRadius:10, letterSpacing:'0.08em', textTransform:'uppercase', marginTop:6, color:'#fff', background:isClockedIn?'#F87171':'#F07B1A' }}>
                {isClockedIn?'CLOCK OUT':showWorkOrder?'CLOCK IN':'CONTINUE'}
              </button>
              {showWorkOrder && !isClockedIn && (
                <button onClick={() => handleClockAction(true)} style={{ background:'none', border:'none', color:'#9C9589', fontSize:12, textDecoration:'underline', textUnderlineOffset:3, padding:'4px 0', fontFamily:"'Barlow',system-ui,sans-serif" }}>
                  Skip — Clock in without work order
                </button>
              )}
            </div>
          )}
        </div>
        <a href={`/admin?locationId=${locationId}`} style={{ color:'#9C9589', fontSize:12, marginTop:32, opacity:0.5, textDecoration:'none' }}>Admin Panel →</a>
      </div>
    </div>
  );
}

export default function ClockPage() {
  return <Suspense fallback={<div style={{minHeight:'100vh',background:'#1A1A1A'}} />}><ClockInner /></Suspense>;
}
