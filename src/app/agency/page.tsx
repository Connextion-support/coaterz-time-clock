'use client';
import { useState, useEffect, useCallback } from 'react';

const C = { orange:'#F07B1A', orangeGlow:'rgba(240,123,26,0.12)', orangeBorder:'rgba(240,123,26,0.3)',
  surface:'#2A2A2A', charcoal:'#242424', border:'#3D3D3D', text:'#F0ECE6', muted:'#9C9589',
  green:'#4ADE80', greenGlow:'rgba(74,222,128,0.10)', red:'#F87171', blue:'#60A5FA',
  purple:'#A78BFA', purpleGlow:'rgba(167,139,250,0.12)', purpleBorder:'rgba(167,139,250,0.3)' };

export default function AgencyPage() {
  const [auth, setAuth] = useState(false);
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [locations, setLocations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name:'', ghlLocationId:'', ghlApiKey:'', webhookUrl:'', overtimeThreshold:'40', adminPassword:'admin', timezone:'America/New_York' });
  const [syncing, setSyncing] = useState<string|null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);

  const inp: React.CSSProperties = {width:'100%',padding:'11px 14px',fontSize:14,fontFamily:"'Barlow',system-ui,sans-serif",background:C.charcoal,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,outline:'none',boxSizing:'border-box'};
  const lbl: React.CSSProperties = {fontSize:11,fontWeight:700,color:C.muted,textTransform:'uppercase',letterSpacing:'0.08em',display:'block',marginBottom:4};
  const th: React.CSSProperties = {textAlign:'left',padding:'11px 14px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',color:C.muted,background:C.surface,borderBottom:`1px solid ${C.border}`};
  const td: React.CSSProperties = {padding:'11px 14px',verticalAlign:'middle',borderBottom:`1px solid ${C.border}`};

  const handleLogin = async () => {
    const res = await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,type:'agency'})});
    const data = await res.json();
    if (data.success) { setAuth(true); setToken(data.token); } else alert('Invalid password');
  };

  const headers = useCallback(() => ({'Content-Type':'application/json','x-api-key':token}), [token]);

  const loadLocations = useCallback(async () => {
    const res = await fetch('/api/locations',{headers:{'x-api-key':token}});
    const data = await res.json();
    setLocations(data.locations || []);
  }, [token]);

  useEffect(() => { if (auth) loadLocations(); }, [auth, loadLocations]);

  const saveLocation = async () => {
    if (!form.name || !form.ghlLocationId) return alert('Name and GHL Location ID required');
    const method = editing ? 'PUT' : 'POST';
    const body: any = editing
      ? { id: editing.id, name: form.name, ghlApiKey: form.ghlApiKey, webhookUrl: form.webhookUrl, overtimeThreshold: form.overtimeThreshold, adminPassword: form.adminPassword, timezone: form.timezone }
      : { name: form.name, ghlLocationId: form.ghlLocationId, ghlApiKey: form.ghlApiKey, webhookUrl: form.webhookUrl, overtimeThreshold: form.overtimeThreshold, adminPassword: form.adminPassword, timezone: form.timezone };
    await fetch('/api/locations',{method,headers:headers(),body:JSON.stringify(body)});
    setShowForm(false); setEditing(null); setForm({name:'',ghlLocationId:'',ghlApiKey:'',webhookUrl:'',overtimeThreshold:'40',adminPassword:'admin',timezone:'America/New_York'});
    loadLocations();
  };

  const deactivateLocation = async (id: string) => {
    if (!confirm('Deactivate this location?')) return;
    await fetch(`/api/locations?id=${id}`,{method:'DELETE',headers:headers()});
    loadLocations();
  };

  const syncLocation = async (ghlLocId: string) => {
    setSyncing(ghlLocId); setSyncResult(null);
    const res = await fetch('/api/sync-users',{method:'POST',headers:headers(),body:JSON.stringify({locationId:ghlLocId})});
    const data = await res.json(); setSyncResult({ghlLocId,...data}); setSyncing(null);
  };

  if (!auth) return (
    <div style={{minHeight:'100vh',display:'flex',justifyContent:'center',padding:'20px 16px'}}>
      <div style={{width:'100%',maxWidth:400,paddingTop:60,display:'flex',flexDirection:'column',gap:12}}>
        <h2 style={{fontSize:22,fontWeight:800,margin:'8px 0',fontFamily:"'Barlow Condensed',system-ui,sans-serif",color:C.purple}}>Agency Admin</h2>
        <p style={{color:C.muted,fontSize:14,margin:'0 0 12px'}}>Master admin panel for managing all sub-accounts</p>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleLogin();}}
          placeholder="Agency password" style={inp} autoFocus />
        <button onClick={handleLogin} style={{width:'100%',padding:'15px',fontSize:16,fontWeight:800,fontFamily:"'Barlow Condensed',system-ui,sans-serif",border:'none',borderRadius:10,background:C.purple,color:'#fff',letterSpacing:'0.08em',textTransform:'uppercase',marginTop:4}}>Login</button>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',display:'flex',justifyContent:'center',padding:'20px 16px'}}>
      <div style={{width:'100%',maxWidth:1100}}>
        <div style={{borderBottom:`1px solid ${C.border}`,paddingBottom:16,marginBottom:24}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
            <span style={{fontSize:10,fontWeight:700,color:C.purple,background:C.purpleGlow,border:`1px solid ${C.purpleBorder}`,padding:'2px 8px',borderRadius:4,textTransform:'uppercase',letterSpacing:'0.06em'}}>Agency</span>
          </div>
          <h2 style={{fontSize:24,fontWeight:800,margin:0,fontFamily:"'Barlow Condensed',system-ui,sans-serif"}}>CoaterZ Time Clock — Location Manager</h2>
          <p style={{color:C.muted,fontSize:13,margin:'4px 0 0'}}>Register and manage GHL sub-accounts. Each location gets its own employees, time entries, and settings.</p>
        </div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:24}}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'20px 16px',textAlign:'center'}}>
            <div style={{fontSize:32,fontWeight:800,color:C.purple,fontFamily:"'Barlow Condensed',system-ui,sans-serif"}}>{locations.filter((l: any)=>l.is_active).length}</div>
            <div style={{fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',fontWeight:600,marginTop:4}}>Active Locations</div>
          </div>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'20px 16px',textAlign:'center'}}>
            <div style={{fontSize:32,fontWeight:800,color:C.orange,fontFamily:"'Barlow Condensed',system-ui,sans-serif"}}>{locations.length}</div>
            <div style={{fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',fontWeight:600,marginTop:4}}>Total Locations</div>
          </div>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'20px 16px',textAlign:'center'}}>
            <div style={{fontSize:32,fontWeight:800,color:C.green,fontFamily:"'Barlow Condensed',system-ui,sans-serif"}}>{locations.filter((l: any)=>l.ghl_api_key).length}</div>
            <div style={{fontSize:10,color:C.muted,textTransform:'uppercase',letterSpacing:'0.06em',fontWeight:600,marginTop:4}}>API Keys Set</div>
          </div>
        </div>

        {/* Add button */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{fontSize:15,fontWeight:700,margin:0,textTransform:'uppercase',fontFamily:"'Barlow Condensed',system-ui,sans-serif"}}>Sub-Account Locations</h3>
          <button onClick={()=>{setShowForm(true);setEditing(null);setForm({name:'',ghlLocationId:'',ghlApiKey:'',webhookUrl:'',overtimeThreshold:'40',adminPassword:'admin',timezone:'America/New_York'});}}
            style={{padding:'9px 20px',fontSize:13,fontWeight:700,background:C.purple,color:'#fff',border:'none',borderRadius:8}}>+ Add Location</button>
        </div>

        {/* Form modal */}
        {showForm && (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:16}}>
            <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:'28px 30px',maxWidth:600,width:'100%',maxHeight:'90vh',overflowY:'auto'}}>
              <h3 style={{fontSize:18,fontWeight:700,margin:'0 0 20px',color:C.text}}>{editing?'Edit Location':'Register New Location'}</h3>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 16px'}}>
                <div><label style={lbl}>Business Name *</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={inp} placeholder="Acme Coating Co" /></div>
                <div><label style={lbl}>GHL Location ID *</label><input value={form.ghlLocationId} onChange={e=>setForm({...form,ghlLocationId:e.target.value})} style={inp} placeholder="abc123xyz" disabled={!!editing} /></div>
                <div style={{gridColumn:'1/-1'}}><label style={lbl}>GHL Sub-Account API Key</label><input value={form.ghlApiKey} onChange={e=>setForm({...form,ghlApiKey:e.target.value})} style={inp} placeholder="eyJhbGci..." type="password" /></div>
                <div style={{gridColumn:'1/-1'}}><label style={lbl}>GHL Outbound Webhook URL</label><input value={form.webhookUrl} onChange={e=>setForm({...form,webhookUrl:e.target.value})} style={inp} placeholder="https://services.leadconnectorhq.com/hooks/..." /></div>
                <div><label style={lbl}>Overtime Threshold (hrs)</label><input value={form.overtimeThreshold} onChange={e=>setForm({...form,overtimeThreshold:e.target.value})} style={inp} type="number" /></div>
                <div><label style={lbl}>Location Admin Password</label><input value={form.adminPassword} onChange={e=>setForm({...form,adminPassword:e.target.value})} style={inp} /></div>
                <div><label style={lbl}>Timezone</label><input value={form.timezone} onChange={e=>setForm({...form,timezone:e.target.value})} style={inp} placeholder="America/New_York" /></div>
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:20}}>
                <button onClick={()=>setShowForm(false)} style={{padding:'10px 20px',background:'none',border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,fontSize:13}}>Cancel</button>
                <button onClick={saveLocation} style={{padding:'10px 28px',fontSize:14,fontWeight:800,fontFamily:"'Barlow Condensed',system-ui,sans-serif",border:'none',borderRadius:10,background:C.purple,color:'#fff'}}>Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Locations table */}
        <div style={{overflowX:'auto',borderRadius:10,border:`1px solid ${C.border}`}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr>{['Name','GHL Location ID','API Key','Webhook','OT Threshold','Status','Actions'].map((h,i)=><th key={i} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {locations.length===0&&<tr><td colSpan={7} style={{...td,textAlign:'center',padding:30,color:C.muted}}>No locations registered yet</td></tr>}
              {locations.map((loc: any) => (
                <tr key={loc.id}>
                  <td style={{...td,fontWeight:600}}>{loc.name}</td>
                  <td style={{...td,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{loc.ghl_location_id}</td>
                  <td style={td}>{loc.ghl_api_key?<span style={{color:C.green,fontWeight:600}}>Set</span>:<span style={{color:C.red}}>Not set</span>}</td>
                  <td style={td}>{loc.webhook_url?<span style={{color:C.green}}>✓</span>:<span style={{color:C.muted}}>—</span>}</td>
                  <td style={td}>{loc.overtime_threshold}h</td>
                  <td style={td}>{loc.is_active?<span style={{color:C.green,fontWeight:600}}>Active</span>:<span style={{color:C.red}}>Inactive</span>}</td>
                  <td style={td}>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      <button onClick={()=>syncLocation(loc.ghl_location_id)} disabled={syncing===loc.ghl_location_id}
                        style={{padding:'4px 10px',fontSize:11,fontWeight:600,background:C.blue,color:'#fff',border:'none',borderRadius:4,opacity:syncing===loc.ghl_location_id?0.5:1}}>
                        {syncing===loc.ghl_location_id?'...':'Sync'}
                      </button>
                      <button onClick={()=>{setEditing(loc);setForm({name:loc.name,ghlLocationId:loc.ghl_location_id,ghlApiKey:'',webhookUrl:loc.webhook_url||'',overtimeThreshold:String(loc.overtime_threshold),adminPassword:loc.admin_password||'',timezone:loc.timezone||''});setShowForm(true);}}
                        style={{padding:'4px 10px',fontSize:11,fontWeight:600,background:C.orangeGlow,color:C.orange,border:`1px solid ${C.orangeBorder}`,borderRadius:4}}>Edit</button>
                      <a href={`/admin?locationId=${loc.ghl_location_id}`} target="_blank" rel="noreferrer"
                        style={{padding:'4px 10px',fontSize:11,fontWeight:600,background:'rgba(255,255,255,0.05)',color:C.muted,border:`1px solid ${C.border}`,borderRadius:4,textDecoration:'none'}}>Admin →</a>
                      {loc.is_active&&<button onClick={()=>deactivateLocation(loc.id)}
                        style={{padding:'4px 10px',fontSize:11,fontWeight:600,background:'none',color:C.red,border:'none',opacity:0.5,cursor:'pointer'}}>✕</button>}
                    </div>
                    {syncResult?.ghlLocId===loc.ghl_location_id&&(
                      <div style={{marginTop:6,fontSize:11,color:syncResult.success?C.green:C.red}}>{syncResult.success?`✓ ${syncResult.message}`:`✕ ${syncResult.error}`}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Setup guide */}
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'20px 24px',marginTop:24}}>
          <h4 style={{fontSize:15,fontWeight:700,margin:'0 0 8px',color:C.purple,fontFamily:"'Barlow Condensed',system-ui,sans-serif"}}>GHL Custom Menu Link Setup</h4>
          <p style={{fontSize:13,color:C.muted,lineHeight:1.6,margin:'0 0 12px'}}>To add the time clock as a menu item inside each GHL sub-account:</p>
          <div style={{fontSize:12,color:C.muted,background:C.charcoal,borderRadius:8,padding:'16px',fontFamily:"'JetBrains Mono',monospace",border:`1px solid ${C.border}`,lineHeight:2}}>
            <div>1. Go to <span style={{color:C.text}}>Agency Settings → Custom Menu Links</span></div>
            <div>2. Add a new link:</div>
            <div>   Name: <span style={{color:C.orange}}>Time Clock</span></div>
            <div>   URL: <span style={{color:C.orange}}>{'https://YOUR-DOMAIN.vercel.app/?locationId={{location.id}}'}</span></div>
            <div>   Icon: Clock</div>
            <div>3. The app auto-detects the locationId from the URL</div>
            <div>4. Each sub-account sees only their own employees and data</div>
          </div>
        </div>
      </div>
    </div>
  );
}
