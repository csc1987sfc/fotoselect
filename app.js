const SURL = 'https://urpjnmbhhbzeirktpzcv.supabase.co';
const SKEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycGpubWJoaGJ6ZWlya3RwemN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDU3NDQsImV4cCI6MjA5NTIyMTc0NH0.-DFxwerywoeoiOPzErn2PVCCosTKjuUMIVBBdXQ_RNE';

let _session = null;
let _authListeners = [];

function _saveSession(s){ _session=s; if(s) localStorage.setItem('sb_session',JSON.stringify(s)); else localStorage.removeItem('sb_session'); }
function _loadSession(){ if(!_session){ const s=localStorage.getItem('sb_session'); if(s) try{ _session=JSON.parse(s); }catch(e){} } return _session; }
function _notify(event,session){ _authListeners.forEach(cb=>{ try{cb(event,session);}catch(e){} }); }
function _token(){ return _loadSession()?.access_token||SKEY; }

function _headers(extra={}){ return {'apikey':SKEY,'Authorization':`Bearer ${_token()}`,'Content-Type':'application/json',...extra}; }

async function _restGet(table, qs='', opts={}){
  const h = _headers(opts.count?{'Prefer':'count=exact'}:{});
  if(opts.single) h['Accept']='application/vnd.pgrst.object+json';
  try{
    const r = await fetch(`${SURL}/rest/v1/${table}?${qs}`,{
      method:opts.head?'HEAD':'GET',
      headers:h,
      cache: 'no-store' 
    });
    if(opts.head||opts.count){ const cr=r.headers.get('content-range'); return {data:null,count:cr?parseInt(cr.split('/')[1]||'0'):0,error:null}; }
    const d = await r.json();
    if(d&&d.code) return {data:null,error:d};
    return {data:d,error:null};
  }catch(e){return {data:null,error:{message:e.message}};}
}

async function _restWrite(method, table, body, filters=''){
  try{
    const r = await fetch(`${SURL}/rest/v1/${table}${filters?'?'+filters:''}`,{method,headers:_headers({'Prefer':'return=representation'}),body:JSON.stringify(body)});
    if(r.status===204) return {data:null,error:null};
    const d = await r.json();
    if(d&&(d.code||d.error)) return {data:null,error:d};
    return {data:d,error:null};
  }catch(e){return {data:null,error:{message:e.message}};}
}

const sbAuth = {
  async signUp({email,password,options:{data:meta}={}}){
    try{
      const r = await fetch(`${SURL}/auth/v1/signup`,{method:'POST',headers:{'apikey':SKEY,'Content-Type':'application/json'},body:JSON.stringify({email,password,data:meta||{}})});
      const d = await r.json();
      if(d.error||d.error_description) return {data:null,error:{message:d.error_description||d.error}};
      if(d.access_token){ _saveSession({access_token:d.access_token,user:d.user}); _notify('SIGNED_IN',_session); }
      return {data:{user:d.user},error:null};
    }catch(e){return {data:null,error:{message:e.message}};}
  },
  async signInWithPassword({email,password}){
    try{
      const r = await fetch(`${SURL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'apikey':SKEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
      const d = await r.json();
      if(d.error||d.error_description) return {data:null,error:{message:d.error_description||d.error||'Credenciales incorrectas'}};
      _saveSession({access_token:d.access_token,refresh_token:d.refresh_token,user:d.user});
      _notify('SIGNED_IN',_session);
      return {data:{user:d.user,session:_session},error:null};
    }catch(e){return {data:null,error:{message:e.message}};}
  },
  async signOut(){ _saveSession(null); _notify('SIGNED_OUT',null); return {error:null}; },
  async getSession(){ _loadSession(); return {data:{session:_session}}; },
  async getUser(){ _loadSession(); return {data:{user:_session?.user||null}}; },
  onAuthStateChange(cb){ _authListeners.push(cb); _loadSession(); if(_session) setTimeout(()=>cb('INITIAL_SESSION',_session),0); return {data:{subscription:{unsubscribe:()=>{ _authListeners=_authListeners.filter(l=>l!==cb); }}}}; }
};

function sbFrom(table){
  const s={table,filters:[],cols:'*',orderCol:null,orderAsc:true,lim:null,isSingle:false,isHead:false,countMode:null};
  const qs=()=>{
    let q=`select=${encodeURIComponent(s.cols)}`;
    s.filters.forEach(f=>{ 
      if(f.t==='eq') q+=`&${f.col}=eq.${encodeURIComponent(f.v)}`; 
      else if(f.t==='in') q+=`&${f.col}=in.(${f.vs.map(v=>encodeURIComponent(v)).join(',')})`;
    });
    if(s.orderCol) q+=`&order=${s.orderCol}.${s.orderAsc?'asc':'desc'}`;
    if(s.lim) q+=`&limit=${s.lim}`;
    return q;
  };
  const fqs=()=>{ 
    const parts=[]; 
    s.filters.forEach(f=>{ 
      if(f.t==='eq') parts.push(`${f.col}=eq.${encodeURIComponent(f.v)}`); 
      else if(f.t==='in') parts.push(`${f.col}=in.(${f.vs.map(v=>encodeURIComponent(v)).join(',')})`);
    }); 
    return parts.join('&'); 
  };
  const b={
    select(cols='*',opts={}){ s.cols=cols; if(opts.count) s.countMode=opts.count; if(opts.head) s.isHead=opts.head; return b; },
    eq(col,v){ s.filters.push({t:'eq',col,v}); return b; },
    in(col,vs){ s.filters.push({t:'in',col,vs}); return b; },
    order(col,opts={}){ s.orderCol=col; s.orderAsc=opts.ascending!==false; return b; },
    limit(n){ s.lim=n; return b; },
    single(){ s.isSingle=true; return b; },
    async insert(data){ return _restWrite('POST',s.table,Array.isArray(data)?data:[data]); },
    async update(data){ return _restWrite('PATCH',s.table,data,fqs()); },
    async delete(){ return _restWrite('DELETE',s.table,undefined,fqs()); },
    then(res,rej){ return _restGet(s.table,qs(),{single:s.isSingle,head:s.isHead,count:s.countMode}).then(res,rej); }
  };
  return b;
}

const sb = { auth: sbAuth, from: sbFrom };

let currentUser = null;
let currentRole = 'photographer'; 
let currentSession = null; 
let currentClientRow = null; 
let currentMaxSelections = null; 
let toastT;

function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),3000); }
function showScreen(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); document.getElementById('screen-'+id).classList.add('active'); }

function switchTab(t){ 
  document.getElementById('tab-login').style.display = t==='login'?'':'none'; 
  document.getElementById('tab-register').style.display = t==='register'?'':'none'; 
  const tabs = document.querySelectorAll('.auth-tab');
  if(t==='login'){ tabs[0].classList.add('active'); tabs[1].classList.remove('active'); }
  else { tabs[1].classList.add('active'); tabs[0].classList.remove('active'); }
}

function setRole(r, el){ currentRole=r; document.querySelectorAll('.role-btn').forEach(b=>b.classList.remove('active')); el.classList.add('active'); }
function showErr(id,msg){ const e=document.getElementById(id); e.textContent=msg; e.classList.add('show'); }
function hideErr(id){ document.getElementById(id).classList.remove('show'); }
function openLightbox(url){ document.getElementById('lightbox-img').src = url; document.getElementById('lightbox').classList.add('open'); }

function optUrl(url, opts){
  if(!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', '/upload/'+opts+'/');
}

function optimizarYComprimir(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) { resolve(file); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_ANCHO = 1600;
        const MAX_ALTO = 1600;
        let ancho = img.width;
        let alto = img.height;

        if (ancho > alto) {
          if (ancho > MAX_ANCHO) { alto *= MAX_ANCHO / ancho; ancho = MAX_ANCHO; }
        } else {
          if (alto > MAX_ALTO) { ancho *= MAX_ALTO / alto; alto = MAX_ALTO; }
        }
        canvas.width = ancho;
        canvas.height = alto;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, ancho, alto);
        canvas.toBlob((blob) => { resolve(blob || file); }, 'image/jpeg', 0.85);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleLogin(){
  hideErr('login-err');
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  if(!email||!pass){ showErr('login-err','Introduce datos'); return; }

  if(currentRole==='photographer'){
    const {data,error} = await sb.auth.signInWithPassword({email,password:pass});
    if(error){ showErr('login-err','Credenciales incorrectas'); return; }
    
    let {data:profile} = await sb.from('profiles').select('*').eq('id',data.user.id).single();
    
    if(!profile) {
      showErr('login-err','⛔ Tu cuenta ha sido eliminada de la plataforma.');
      await sb.auth.signOut();
      currentUser = null;
      return;
    }

    if(profile && profile.active === false) {
      showErr('login-err','⛔ Tu cuenta se encuentra suspendida por impago. Contacta con soporte.');
      await sb.auth.signOut();
      currentUser = null;
      return;
    }

    currentUser = data.user;
    loadPhotographerDashboard();
  } else {
   // 1. INICIO DE SESIÓN OFICIAL DE SUPABASE
        const { data: authData, error: authError } = await sb.auth.signInWithPassword({
            email: email,
            password: pass
        });

        if (authError) {
            showErr('login-err', 'Email o contraseña incorrectos');
            return;
        }

        // 2. BUSCAMOS SU FICHA USANDO SU CARNET OFICIAL
        const { data: clients, error: clientError } = await sb.from('clients').select('*').eq('auth_user_id', authData.user.id);

        if (clientError || !clients || clients.length === 0) {
            showErr('login-err', 'Cuenta de cliente no encontrada');
            return;
        }

        // 3. LE DEJAMOS PASAR A SU GALERÍA
        currentClientRow = clients[0];
        loadClientView();
  }
}

async function handleRegister(){
  hideErr('reg-err');
  const code=document.getElementById('reg-code').value.trim();
  const name=document.getElementById('reg-name').value.trim();
  const email=document.getElementById('reg-email').value.trim();
  const pass=document.getElementById('reg-pass').value;

  if(!code || !email || !pass){ showErr('reg-err','Rellena Código, Email y Contraseña'); return; }

  if(currentRole === 'photographer'){
    if(!name){ showErr('reg-err','Introduce el nombre de tu estudio'); return; }
    
    const {data:codes} = await sb.from('invite_codes').select('*').eq('code',code).eq('used',false);
    if(!codes||codes.length===0){ showErr('reg-err','Código de fotógrafo no válido o ya usado'); return; }

    if(codes[0].email && codes[0].email.toLowerCase() !== email.toLowerCase()) {
      showErr('reg-err', 'El email introducido no coincide con el correo autorizado para este código.');
      return;
    }

    const {data,error} = await sb.auth.signUp({email,password:pass});
    if(error){ showErr('reg-err',error.message); return; }

    const {data: existing} = await sb.from('profiles').select('id').eq('id', data.user.id).single();
    if (existing) {
      await sb.from('profiles').eq('id', data.user.id).update({username:name, email:email, active:true});
    } else {
      await sb.from('profiles').insert({id:data.user.id, username:name, email:email, active:true});
    }
    await sb.from('invite_codes').eq('id',codes[0].id).update({used:true, used_by:data.user.id});

    currentUser = data.user;
    loadPhotographerDashboard();

  } else {
    const {data:clients, error} = await sb.from('clients').select('*').eq('access_code',code);
    if(error || !clients || clients.length===0){ showErr('reg-err','Código de cliente no válido o ya ha sido utilizado.'); return; }

    const client = clients[0];

    // 1. REGISTRO OFICIAL SEGURO EN SUPABASE
            const { data: authData, error: authError } = await sb.auth.signUp({
                email: email,
                password: pass
            });

            if (authError) {
                showErr('reg-err', 'Error de seguridad: ' + authError.message);
                return;
            }

    const {error: upErr} = await sb.from('clients').update({
                email: email,
                auth_user_id: authData.user.id, // ESTA ES LA LLAVE NUEVA
                access_code: null,
            name: name || client.name
        }).eq('id', client.id);

    if(upErr){ showErr('reg-err','Error guardando tus datos. Contacta con tu fotógrafo.'); return; }

    currentClientRow = { ...client, email: email, access_code: null };
    loadClientView();
  }
}

function logout(){ sb.auth.signOut(); currentUser=null; currentClientRow=null; currentSession=null; showScreen('auth'); }

async function renderAdminPanel(){
  const body = document.getElementById('admin-body');
  body.innerHTML = '<div class="loading">Cargando datos comerciales…</div>';
  
  const [{data:photographers}, {data:pendingCodes}] = await Promise.all([
    sb.from('profiles').select('*').order('created_at',{ascending:false}),
    sb.from('invite_codes').select('*').eq('used', false)
  ]);

  let phHtml = '';
  (photographers||[]).forEach(p=>{
    const isSuspended = p.active === false;
    const isAdmin = p.email === 'csc87sfc@gmail.com'; 

    phHtml += `<div class="ph-item">
      <div>
        <div style="font-weight:500; color:var(--text); font-size:14px;">${escHtml(p.username||'Estudio sin nombre')}</div>
        <div style="font-size:11px; color:var(--muted); margin-top:2px;">${escHtml(p.email)}</div>
        <div style="margin-top:6px;">
          <span style="font-size:10px; font-weight:500; padding:3px 8px; border-radius:2px; background:${isSuspended ? 'rgba(192,57,43,0.15)' : 'rgba(201,169,110,0.15)'}; color:${isSuspended ? '#e07060' : 'var(--gold)'};">
            ${isSuspended ? '🛑 SUSPENDIDO' : '🟢 ACTIVA'}
          </span>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        ${isAdmin ? 
          `<span style="font-size:11px; color:var(--gold); font-weight:600; padding-right:8px;">👑 ADMIN SUPREMO</span>` 
          : 
          `<button class="btn-sm" style="padding:6px 12px; font-size:11px; border-color:${isSuspended ? 'var(--gold)' : 'var(--muted)'}; color:${isSuspended ? 'var(--gold)' : 'var(--muted)'};" onclick="toggleSuspensionFotografo('${p.id}', ${p.active})">
            ${isSuspended ? '✅ Activar' : '⛔ Suspender'}
          </button>
          <button class="btn-sm danger" style="padding:6px 12px; font-size:11px;" onclick="borrarFotografoTotal('${p.id}')">🗑️ Eliminar</button>`
        }
      </div>
    </div>`;
  });

  let codesHtml = '';
  if(pendingCodes && pendingCodes.length > 0) {
    pendingCodes.forEach(pc => {
      codesHtml += `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid var(--border); font-size:13px;">
        <span style="color:var(--text)">${escHtml(pc.email || 'Email no asignado')}</span>
        <strong style="color:var(--gold); letter-spacing:1px;">${pc.code}</strong>
      </div>`;
    });
  } else {
    codesHtml = '<p style="color:var(--muted); font-size:12px; margin-top:10px;">Todo al día. No hay códigos pendientes.</p>';
  }

  body.innerHTML = `
    <div class="back-btn" onclick="showScreen('photographer')">← Volver al estudio</div>
    <h2 class="dash-title">Administración Global</h2>
    <p class="dash-sub">Gestión comercial exclusiva</p>
    
    <div class="admin-cols">
      <div class="admin-card">
        <h3 style="font-family:'Playfair Display',serif; font-size:1.2rem; margin-bottom:16px; color:var(--gold);">➕ Nuevo Fotógrafo</h3>
        <p style="font-size:12px; color:var(--muted); margin-bottom:16px;">Introduce el email del fotógrafo para asignarle un código único.</p>
        
        <div class="field">
          <input type="email" id="admin-new-ph-email" placeholder="correo@delfotografo.com"/>
        </div>
        <button class="btn-primary" onclick="generarCodigoFotografo()">Asignar y Generar Código</button>
        
        <div style="margin-top:32px;">
          <h4 style="font-family:'Jost',sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:var(--muted); border-bottom:1px solid var(--border); padding-bottom:8px;">Códigos enviados sin usar</h4>
          <div style="max-height:200px; overflow-y:auto; padding-right:4px;">
            ${codesHtml}
          </div>
        </div>
      </div>

      <div class="admin-card">
        <h3 style="font-family:'Playfair Display',serif; font-size:1.2rem; margin-bottom:16px;">📸 Estudios Registrados</h3>
        <div style="max-height:450px; overflow-y:auto; padding-right:6px;">
          ${phHtml||'<p style="color:var(--muted); font-size:12px; padding:20px 0;">No hay fotógrafos registrados activamente.</p>'}
        </div>
      </div>
    </div>`;
}

async function generarCodigoFotografo(){
  const email = document.getElementById('admin-new-ph-email').value.trim();
  if(!email) { alert('Por favor, escribe el email del fotógrafo primero.'); return; }

  const {data: existing} = await sb.from('invite_codes').select('*').eq('email', email).eq('used', false);
  if(existing && existing.length > 0) {
    alert('Este fotógrafo ya tiene un código generado esperando a ser usado: ' + existing[0].code);
    return;
  }

  const code = 'FOTO-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const {error} = await sb.from('invite_codes').insert({code: code, used: false, email: email});
  
  if(error) { alert('Error de conexión con la base de datos: ' + error.message); return; }
  
  toast('¡Código asignado al email correctamente!');
  renderAdminPanel(); 
}

async function toggleSuspensionFotografo(idFotografo, estadoActual){
  const nuevoEstado = !estadoActual;
  if(!confirm(nuevoEstado ? '¿Reactivar cuenta?' : '⚠️ ¿Suspender fotógrafo por impago?')) return;
  const { error } = await sb.from('profiles').eq('id', idFotografo).update({ active: nuevoEstado });
  if(error) { alert('Error: ' + JSON.stringify(error)); return; }
  renderAdminPanel();
}

async function borrarFotografoTotal(idFotografo){
  if(!confirm("⚠️ ¿Eliminar al fotógrafo y sus datos para siempre?")) return;
  const { error } = await sb.from('profiles').eq('id', idFotografo).delete();
  if(error) { alert('Error: ' + JSON.stringify(error)); return; }
  renderAdminPanel();
}

async function loadPhotographerDashboard(){
  showScreen('photographer');
  const adminBtn = document.getElementById('admin-btn');
  if (currentUser && currentUser.email === 'csc87sfc@gmail.com') { adminBtn.style.display = ''; } 
  else { adminBtn.style.display = 'none'; }

  const {data:profile} = await sb.from('profiles').select('username').eq('id',currentUser.id).single();
  document.getElementById('ph-user-badge').textContent = profile?.username || currentUser.email;
  renderSessionsList();
}

async function renderSessionsList(){
  const body = document.getElementById('ph-body');
  body.innerHTML = '<div class="loading">Cargando sesiones…</div>';
  const {data:sessions} = await sb.from('sessions').select('*').eq('photographer_id',currentUser.id).order('created_at',{ascending:false});

  let html = `<h2 class="dash-title">Tu <em>estudio</em></h2><p class="dash-sub">Gestiona sesiones</p><div class="sessions-grid">`;
  (sessions||[]).forEach(s=>{
    let badgeLimite = s.max_selections ? `<span style="font-size:10px; background:rgba(201,169,110,0.15); color:var(--gold); padding:2px 6px; border-radius:2px; margin-left:8px;">Límite: ${s.max_selections}</span>` : '';
    html += `<div class="session-card" onclick="openSession('${s.id}','${escHtml(s.name)}')">
      <div class="card-del" onclick="event.stopPropagation(); deleteSession('${s.id}','${escHtml(s.name)}')">🗑️</div>
      <h3>${escHtml(s.name)}${badgeLimite}</h3>
      <p>${escHtml(s.description||'Sin descripción')}</p>
    </div>`;
  });
  html += '</div>';
  body.innerHTML = html;
}

function openSession(id, name){ currentSession = {id, name}; renderSessionDetail(); }

async function renderSessionDetail(){
  const body = document.getElementById('ph-body');
  body.innerHTML = '<div class="loading">Cargando galería…</div>';

  const [{data:photos},{data:clients}] = await Promise.all([
    sb.from('photos').select('*').eq('session_id',currentSession.id).order('created_at',{ascending:false}),
    sb.from('clients').select('*').eq('session_id',currentSession.id)
  ]);

  let html = `
    <div class="back-btn" onclick="renderSessionsList()">← Volver</div>
    <h2>${escHtml(currentSession.name)}</h2>
    <div class="upload-zone" style="margin-top:15px"><input type="file" multiple onchange="handleFiles(this.files)"/>Arrastra o pincha aquí para subir fotos</div>
    <div class="photo-grid">`;
    
  (photos||[]).forEach(p=>{
    const thumb = optUrl(p.url, 'w_400,q_auto,f_auto');
    const full = optUrl(p.url, 'q_auto,f_auto');
    html += `<div class="photo-item"><img src="${thumb}" loading="lazy" onclick="openLightbox('${full}')"/><button class="del-btn" onclick="deletePhoto('${p.id}')">×</button></div>`;
  });

  html += `</div><h3 style="margin-top:40px; font-family:'Playfair Display',serif; font-style:italic;">Clientes asignados</h3><table class="clients-table">
    <thead><tr><th>Nombre</th><th>Email del Cliente</th><th>Código de Acceso</th><th>Estado</th><th>Acción</th></tr></thead><tbody>`;
    
  (clients||[]).forEach(c=>{
    let accesoText = c.access_code 
      ? `<span style="color:var(--gold); font-weight:bold; letter-spacing:1px; background:rgba(201,169,110,0.1); padding:4px 8px; border-radius:4px;">${c.access_code}</span>` 
      : `<span style="color:var(--muted)">✓ Ya registrado</span>`;
      
    let emailText = c.email && !c.email.startsWith('pendiente-')
      ? escHtml(c.email) 
      : `<span style="color:var(--muted);font-size:11px">Pendiente de registro</span>`;

    html += `<tr>
      <td>${escHtml(c.name)}</td>
      <td>${emailText}</td>
      <td>${accesoText}</td>
      <td>
        <span style="color:${c.selection_done?'#c9a96e':'#7a7268'}; font-weight:500">${c.selection_done ? '🌟 FINALIZADO' : '⏳ En proceso'}</span>
        ${c.selection_done ? `<button class="btn-sm" style="margin-left:8px; border-color:var(--gold); color:var(--gold); padding:4px 8px;" onclick="copiarNombresArchivos('${c.id}')">📋 Copiar nombres</button>` : ''}
      </td>
      <td><button class="btn-sm danger" onclick="deleteClient('${c.id}')">Eliminar</button></td>
    </tr>`;
  });
  html += `</tbody></table><button class="btn-primary" style="max-width:220px;" onclick="openNewClientModal()">+ Generar código para cliente</button>`;
  body.innerHTML = html;
}

async function handleFiles(inputFiles){
  const files = Array.from(inputFiles);
  if(files.length === 0) return;

  // 1. PONEMOS LA PANTALLA DE CARGA PARA QUE EL FOTÓGRAFO NO TOQUE NADA NI SE SALGA
  const body = document.getElementById('ph-body');
  body.innerHTML = `
    <div class="loading" style="padding-top: 80px;">
      <h3 style="font-family:'Playfair Display',serif; font-size:1.5rem; color:var(--gold); margin-bottom: 10px;">Procesando y subiendo ${files.length} fotos...</h3>
      <p style="color:var(--accent); font-weight:500; margin-bottom: 20px;">⚠️ IMPORTANTE: No cierres ni recargues esta pestaña hasta que termine.</p>
      <div style="font-size: 24px; font-weight: bold; color:var(--text);" id="upload-progress">0 / ${files.length}</div>
    </div>
  `;

  const nombreCarpeta = currentSession.name.replace(/[^a-zA-Z0-9]/g, '_');
  let subidas = 0;

  // 2. MAGIA: SUBIMOS EN LOTES DE 4 EN 4 PARA IR MUCHO MÁS RÁPIDO
  for (let i = 0; i < files.length; i += 4) {
    const lote = files.slice(i, i + 4);

    const promesasLote = lote.map(async (f) => {
      try {
        // Comprime la imagen
        const blobOptimizado = await optimizarYComprimir(f);
        const fd = new FormData(); 
        fd.append('file', blobOptimizado, f.name.replace(/\.[^/.]+$/, "") + ".jpg"); 
        fd.append('upload_preset', 'fotoselect');
        fd.append('folder', `FotoSelect/${nombreCarpeta}`);
        
        // La envía a Cloudinary
        const res = await fetch('https://api.cloudinary.com/v1_1/dgp3tlqtq/image/upload',{method:'POST',body:fd});
        const d = await res.json();
        
        // La guarda en tu base de datos
        const {error: photoErr} = await sb.from('photos').insert({session_id:currentSession.id, url:d.secure_url, filename:f.name});
        if(!photoErr) {
          subidas++;
        } else {
          console.error("Error DB", photoErr);
        }
      } catch(e) { 
        console.error("Fallo subiendo", f.name, e); 
      }
    });

    // Esperamos a que estas 4 fotos terminen antes de lanzar las siguientes 4
    await Promise.all(promesasLote);

    // 3. ACTUALIZAMOS EL CONTADOR EN PANTALLA PARA QUE VEA QUE AVANZA
    const progressEl = document.getElementById('upload-progress');
    if(progressEl) progressEl.textContent = `${subidas} / ${files.length}`;
  }

  // 4. CUANDO TERMINA TODO, AVISAMOS Y RECARGAMOS LA GALERÍA NORMAL
  toast(`¡Galería actualizada! (${subidas}/${files.length} fotos) ✓`);
  renderSessionDetail();
}

async function deleteSession(id, name){
  if(!confirm(`⚠️ ¿Eliminar la sesión "${name}" por completo? Esto borrará TODAS las fotos de esta sesión en la nube para liberar espacio. ¿Confirmas?`)) return;

  const body = document.getElementById('ph-body');
  const htmlOriginal = body.innerHTML; // Guardamos la vista por si falla algo

  try {
    const {data: fotos} = await sb.from('photos').select('url').eq('session_id', id);

    if (fotos && fotos.length > 0) {
      // PANTALLA DE CARGA GIGANTE PARA EL FOTÓGRAFO
      body.innerHTML = `
        <div class="loading" style="padding-top: 80px;">
          <h3 style="font-family:'Playfair Display',serif; font-size:1.5rem; color:var(--gold); margin-bottom: 10px;">Eliminando sesión y limpiando nube...</h3>
          <p style="color:var(--accent); font-weight:500; margin-bottom: 20px;">⚠️ IMPORTANTE: No cierres ni recargues esta pestaña hasta que termine.</p>
          <div style="font-size: 24px; font-weight: bold; color:var(--text);" id="delete-session-progress">0 / ${fotos.length}</div>
        </div>
      `;

      let borradas = 0;
      for (let i = 0; i < fotos.length; i += 4) {
        const lote = fotos.slice(i, i + 4);
        const promesasLote = lote.map(foto => {
          if(foto.url) {
            let public_id = "";
            let urlParts = foto.url.split('/upload/');
            if(urlParts.length > 1) {
              let parts = urlParts[1].split('/');
              if(parts[0].startsWith('v') && !isNaN(parts[0].substring(1))) parts.shift();
              public_id = parts.join('/').substring(0, parts.join('/').lastIndexOf('.'));
            }
            if(public_id) {
              return fetch('https://urpjnmbhhbzeirktpzcv.supabase.co/functions/v1/borrar-fotos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ public_id: public_id })
              }).catch(e=>{});
            }
          }
          return Promise.resolve();
        });
        
        await Promise.all(promesasLote);
        
        // ACTUALIZAMOS EL CONTADOR
        borradas += lote.length;
        const progressEl = document.getElementById('delete-session-progress');
        if(progressEl) progressEl.textContent = `${borradas} / ${fotos.length}`;
      }
    } else {
      body.innerHTML = '<div class="loading">Eliminando sesión vacía...</div>';
    }

    const { error } = await sb.from('sessions').eq('id', id).delete();
    if(error) { toast('Error al borrar'); body.innerHTML = htmlOriginal; return; }

    renderSessionsList();
    toast('¡Sesión y fotos eliminadas con éxito!');
  } catch (e) {
    alert('Ocurrió un error inesperado.');
    body.innerHTML = htmlOriginal;
  }
}

async function deletePhoto(id){ 
  if(!confirm("¿Eliminar esta foto por completo (de la galería y de Cloudinary)?")) return;
  toast('Eliminando foto...');
  
  const { data: foto } = await sb.from('photos').select('url').eq('id', id).single();
  if (foto && foto.url) {
    let public_id = "";
    const urlParts = foto.url.split('/upload/');
    if(urlParts.length > 1) {
      let parts = urlParts[1].split('/');
      if(parts[0].startsWith('v') && !isNaN(parts[0].substring(1))) parts.shift();
      public_id = parts.join('/').substring(0, parts.join('/').lastIndexOf('.'));
    }
    if(public_id) {
      await fetch('https://urpjnmbhhbzeirktpzcv.supabase.co/functions/v1/borrar-fotos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_id: public_id })
      }).catch(e=>{});
    }
  }
  await sb.from('photos').eq('id',id).delete(); 
  renderSessionDetail(); 
}

async function deleteClient(id){ if(!confirm("¿Eliminar cliente?")) return; await sb.from('clients').eq('id',id).delete(); renderSessionDetail(); }

function openNewSessionModal(){ 
  document.getElementById('session-name').value = '';
  document.getElementById('session-desc').value = '';
  document.getElementById('session-limit').value = '';
  document.getElementById('modal-session').classList.add('open'); 
}

function openNewClientModal(){ document.getElementById('modal-client').classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

async function createSession(){
  const name=document.getElementById('session-name').value.trim();
  const desc=document.getElementById('session-desc').value.trim();
  const limitVal=document.getElementById('session-limit').value;
  
  const max_selections = limitVal ? parseInt(limitVal) : null;
  
  if(!name) return;
  
  const {error: sessErr} = await sb.from('sessions').insert({photographer_id:currentUser.id, name, description:desc, max_selections});
  if(sessErr) { alert("❌ ERROR AL CREAR SESIÓN:\n" + JSON.stringify(sessErr)); return; }
  
  closeModal('modal-session');
  renderSessionsList();
}

async function createClient(){
  const name=document.getElementById('client-name').value.trim();
  if(!name) { alert("Por favor, escribe un nombre para el cliente."); return; }

  const btn = document.querySelector('#modal-client .btn-primary');
  btn.disabled = true;
  btn.textContent = 'Generando...';

  const code = 'CLI-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  const emailTemporal = 'pendiente-' + code.toLowerCase() + '@cliente.com';
  const passTemporal = 'pendiente';

  const { error } = await sb.from('clients').insert({
      photographer_id: currentUser.id,
      session_id: currentSession.id,
      name: name,
      access_code: code,
      email: emailTemporal,         
      password_hash: passTemporal,  
      selection_done: false
  });

  btn.disabled = false;
  btn.textContent = 'Generar código cliente';

  if(error) { 
      alert("❌ Error de base de datos.\n\nDetalle técnico: " + error.message); 
      return; 
  }

  closeModal('modal-client');
  document.getElementById('client-name').value = ''; 
  renderSessionDetail();
}

async function loadClientView(){ showScreen('client'); renderClientGallery(); }

async function renderClientGallery(){
  const body = document.getElementById('cl-body');
  body.innerHTML = '<div class="loading">Abriendo tu álbum privado…</div>';
  
  if (!currentClientRow) {
    body.innerHTML = '<div class="loading">Error: No se han encontrado datos del cliente. Por favor, entra otra vez.</div>';
    return;
  }

  try {
    const resClient = await sb.from('clients').select('*').eq('id', currentClientRow.id);
    if(resClient && resClient.data && resClient.data.length > 0) { currentClientRow = resClient.data[0]; }
  } catch(e) { console.error(e); }

  const [resPhotos, resFavs, resSession] = await Promise.all([
    sb.from('photos').select('*').eq('session_id', currentClientRow.session_id).order('created_at', {ascending:false}),
    sb.from('favorites').select('photo_id').eq('client_id', currentClientRow.id),
    sb.from('sessions').select('*').eq('id', currentClientRow.session_id)
  ]);

  const photos = resPhotos?.data || [];
  const favs = resFavs?.data || [];
  const sessData = resSession?.data?.[0] || null;

  currentMaxSelections = sessData?.max_selections ? parseInt(sessData.max_selections) : null;
  
  const favSet = new Set(favs.map(f => f.photo_id));
  const terminado = currentClientRow.selection_done;
  
  document.getElementById('cl-user-badge').textContent = currentClientRow.name || '';

  let limitText = currentMaxSelections ? ` de ${currentMaxSelections}` : '';

  let html = `
    <div class="client-hero">
      <h2>Bienvenido, <em>${escHtml(currentClientRow.name)}</em></h2>
      <p>Toca el corazón para elegir tus fotos, o pulsa sobre la imagen para verla grande.</p>
    </div>
    <div style="text-align:center;margin-bottom:32px">
      <div class="fav-counter">❤ Tienes <strong>${favSet.size}${limitText}</strong> seleccionadas</div>
      ${terminado ? 
        `<div style="color:var(--gold); font-size:14px; font-weight:500; margin-top:20px; border: 1px dashed var(--border); padding:15px; display:inline-block">✓ Has finalizado la selección con éxito. Galería optimizada.</div>` :
        `<button class="btn-primary" id="btn-finalizar" onclick="finalizarSeleccionCliente()">Finalizar y Guardar Selección</button>`
      }
    </div>
    <div class="client-grid">`;

  if (photos.length === 0) {
    html += `<p style="grid-column: 1/-1; text-align: center; color: var(--muted); padding: 40px 0; font-size: 14px;">Aún no se han subido fotografías a este álbum.</p>`;
  } else {
    for(const p of photos){
      if (!p || !p.url) continue;
      const isFav = favSet.has(p.id);
      const thumb = optUrl(p.url, 'w_400,q_auto,f_auto');
      const full = optUrl(p.url, 'q_auto,f_auto');
      
      html += `<div class="client-photo ${isFav?'favorited':''}">
        <img src="${thumb}" loading="lazy" onclick="openLightbox('${full}')"/>
        ${terminado ? '' : `<div class="heart" onclick="toggleFav('${p.id}')">${isFav?'❤️':'🤍'}</div>`}
      </div>`;
    }
  }
  
  html += '</div>';
  body.innerHTML = html;
}

async function finalizarSeleccionCliente(){
  const resFavs = await sb.from('favorites').select('photo_id').eq('client_id', currentClientRow.id);
  const favs = resFavs?.data || [];
  const idsFavoritos = favs.map(f => f.photo_id);
  
  if(!idsFavoritos || idsFavoritos.length === 0){ alert("Debes marcar al menos una fotografía antes de finalizar."); return; }
  if(!confirm(`Vas a guardar ${idsFavoritos.length} fotos favoritas. Las descartadas se eliminarán para liberar espacio en la nube. ¿Confirmas?`)) return;
  
  const body = document.getElementById('cl-body');
  const htmlOriginal = body.innerHTML;

  try {
    const {data: todasLasFotos} = await sb.from('photos').select('id, url').eq('session_id', currentClientRow.session_id);
    const descartes = (todasLasFotos||[]).filter(p => !idsFavoritos.includes(p.id));

    if (descartes.length > 0) { 
      // PANTALLA DE CARGA GIGANTE PARA EL CLIENTE
      body.innerHTML = `
        <div class="loading" style="padding-top: 80px;">
          <h3 style="font-family:'Playfair Display',serif; font-size:1.5rem; color:var(--gold); margin-bottom: 10px;">Procesando y liberando espacio...</h3>
          <p style="color:var(--accent); font-weight:500; margin-bottom: 20px;">⚠️ IMPORTANTE: No cierres ni recargues esta pestaña hasta que termine.</p>
          <div style="font-size: 24px; font-weight: bold; color:var(--text);" id="delete-progress">0 / ${descartes.length}</div>
        </div>
      `;

      let borradas = 0;
      for (let i = 0; i < descartes.length; i += 4) {
        const lote = descartes.slice(i, i + 4);
        const promesasLote = lote.map(foto => {
          if(foto.url) {
            let public_id = "";
            let urlParts = foto.url.split('/upload/');
            if(urlParts.length > 1) {
              let parts = urlParts[1].split('/');
              if(parts[0].startsWith('v') && !isNaN(parts[0].substring(1))) parts.shift();
              public_id = parts.join('/').substring(0, parts.join('/').lastIndexOf('.'));
            }
            if(public_id) {
              return fetch('https://urpjnmbhhbzeirktpzcv.supabase.co/functions/v1/borrar-fotos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ public_id: public_id })
              }).catch(e=>{});
            }
          }
          return Promise.resolve();
        });
        
        await Promise.all(promesasLote);

        // ACTUALIZAMOS EL CONTADOR DEL CLIENTE
        borradas += lote.length;
        const progressEl = document.getElementById('delete-progress');
        if(progressEl) progressEl.textContent = `${borradas} / ${descartes.length}`;
      }
      
      const idsDescartes = descartes.map(d => d.id);
      await sb.from('photos').in('id', idsDescartes).delete(); 
    } else {
      body.innerHTML = '<div class="loading">Guardando selección...</div>';
    }
    
    await sb.from('clients').eq('id', currentClientRow.id).update({ selection_done: true, selection_done_at: new Date().toISOString() });
    
    currentClientRow.selection_done = true;
    alert('¡Selección completada! Tu fotógrafo ha sido avisado y el espacio se ha liberado.');
    renderClientGallery();
  } catch(e) {
    alert('Ocurrió un imprevisto. Revisa tu conexión.');
    body.innerHTML = htmlOriginal; // Si falla la conexión, le devolvemos la pantalla normal
  }
}

async function toggleFav(photoId){
  const resFavs = await sb.from('favorites').select('*').eq('client_id', currentClientRow.id);
  const favs = resFavs?.data || [];
  const isFav = favs.find(f => f.photo_id === photoId);

  if(isFav){ 
    await sb.from('favorites').eq('id', isFav.id).delete(); 
  } else { 
    if(currentMaxSelections && favs.length >= currentMaxSelections){
      alert(`¡Límite alcanzado!\n\nTu pack incluye un máximo de ${currentMaxSelections} fotos. Debes desmarcar alguna para poder elegir esta.`);
      return; 
    }
    await sb.from('favorites').insert({client_id: currentClientRow.id, photo_id: photoId}); 
  }
  renderClientGallery();
}

(async()=>{
  const {data:{session}} = await sb.auth.getSession();
  if(session){ currentUser=session.user; loadPhotographerDashboard(); } else { showScreen('auth'); }
})();

function escHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Escudo anticopia para evitar descargar fotos
document.addEventListener('contextmenu', function(e) {
  if(e.target.tagName === 'IMG') e.preventDefault();
});

// Función exclusiva para el fotógrafo: Copiar nombres de archivos seleccionados
async function copiarNombresArchivos(clientId) {
  toast('Generando lista de archivos…');
  
  try {
    // 1. Buscamos los IDs de las fotos favoritas de este cliente
    const { data: favs, error: favErr } = await sb.from('favorites').select('photo_id').eq('client_id', clientId);
    if(favErr || !favs || favs.length === 0) { 
      alert('No se han encontrado fotos favoritas para este cliente.'); 
      return; 
    }
    
    const idsFavoritos = favs.map(f => f.photo_id);
    
    // 2. Buscamos los nombres de archivo reales de esas fotos
    const { data: fotos, error: photoErr } = await sb.from('photos').select('filename').in('id', idsFavoritos);
    if(photoErr || !fotos || fotos.length === 0) { 
      alert('Error al recuperar los nombres de los archivos.'); 
      return; 
    }
    
    // 3. Juntamos los nombres separados por comas (formato estándar para buscadores)
    const listaNombres = fotos.map(f => f.filename).join(' | ');
    
    // 4. Lo copiamos al portapapeles del ordenador automáticamente
    await navigator.clipboard.writeText(listaNombres);
    
    // 5. Avisamos con una alerta estética mostrando el resultado
    alert(`📋 ¡Lista copiada al portapapeles!\n\nYa puedes pegarla en Lightroom, Photoshop o en el buscador de carpetas de tu PC:\n\n${listaNombres}`);
    
  } catch (e) {
    alert('No se pudo copiar automáticamente. Revisa los permisos de tu navegador.');
  }
}
