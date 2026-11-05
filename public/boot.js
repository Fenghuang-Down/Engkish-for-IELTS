// ---------- APP BOOT: login, profile, storage and AI adapters ----------
(function(){
  const G = document.getElementById("gate"), GB = document.getElementById("gate-body");
  const show = html => { GB.innerHTML = html; G.hidden = false; };
  const esc = t => String(t==null?"":t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const DAYMS = 864e5;
  const isoD = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const parseD = s => { const [y,m,d]=String(s).split("-").map(Number); return new Date(y,m-1,d); };
  const monday = d => { const x=new Date(d.getFullYear(),d.getMonth(),d.getDate()); x.setDate(x.getDate()-((x.getDay()+6)%7)); return x; };
  let sb=null, user=null, cfg=null;

  // ---- storage: same API the course page already uses (doc/collection/onSnapshot/set/delete) ----
  function makeDb(uid){
    const cache = new Map(); const subs = new Set(); let loaded = null;
    const key = (c,i)=>c+"/"+i;
    const lsKey = "ielts-app-cache-"+uid;
    try{ const c=JSON.parse(localStorage.getItem(lsKey)||"null"); if(c) Object.entries(c).forEach(([k,v])=>cache.set(k,v)); }catch(e){}
    const persist = ()=>{ try{ localStorage.setItem(lsKey, JSON.stringify(Object.fromEntries(cache))); }catch(e){} };
    async function loadAll(){
      const fresh = new Map(); let from=0;
      for(;;){ const { data, error } = await sb.from("docs").select("coll,id,data").range(from, from+999); if(error) throw error;
        data.forEach(r=>fresh.set(key(r.coll,r.id), r.data)); if(data.length<1000) break; from+=1000; }
      cache.clear(); fresh.forEach((v,k)=>cache.set(k,v)); persist(); }
    function notify(filter){ subs.forEach(s=>{ if(!filter || filter(s)) fire(s); }); }
    function fire(s){ try{
      if(s.kind==="doc"){ const v=cache.get(s.path); s.cb({ exists: v!==undefined, id:s.path.split("/")[1], data:()=>v, metadata:{fromCache:false} }); }
      else { const pre=s.coll+"/"; const docs=[...cache.entries()].filter(([k])=>k.startsWith(pre)).map(([k,v])=>({ id:k.slice(pre.length), exists:true, data:()=>v }));
        s.cb({ docs, empty:!docs.length, size:docs.length, metadata:{fromCache:false} }); } }catch(e){ console.error(e); } }
    function subscribe(s){ subs.add(s); (loaded||Promise.resolve()).then(()=>fire(s)).catch(e=>s.err&&s.err({code:"load_failed",message:String(e&&e.message||e)})); return ()=>subs.delete(s); }
    const split = p => { const i=String(p).indexOf("/"); return [p.slice(0,i), p.slice(i+1)]; };
    const db = {
      ready(){ return loaded || (loaded = loadAll()); },
      reload(){ loaded = loadAll(); return loaded.then(()=>notify()); },
      get(path){ return cache.get(path); },
      all(){ return Object.fromEntries(cache); },
      doc(path){ const [c,i]=split(path); return {
        async set(data){ cache.set(path, data); persist(); notify(s=>s.kind==="doc"?s.path===path:s.coll===c);
          const { error } = await sb.from("docs").upsert({ user_id:uid, coll:c, id:i, data, updated_at:new Date().toISOString() }); if(error) throw error; },
        async delete(){ cache.delete(path); persist(); notify(s=>s.kind==="doc"?s.path===path:s.coll===c);
          const { error } = await sb.from("docs").delete().eq("coll",c).eq("id",i); if(error) throw error; },
        onSnapshot(cb, err){ return subscribe({kind:"doc", path, cb, err}); } }; },
      collection(c){ return { onSnapshot(cb, err){ return subscribe({kind:"coll", coll:c, cb, err}); } }; },
      async bulk(rows){ for(let i=0;i<rows.length;i+=200){ const part=rows.slice(i,i+200).map(r=>({user_id:uid, coll:r.coll, id:r.id, data:r.data, updated_at:new Date().toISOString()}));
        const { error } = await sb.from("docs").upsert(part); if(error) throw error; } }
    };
    document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") db.reload().catch(()=>{}); });
    return db;
  }

  // ---- AI: same API as before (sample(prompt,{onText}) and sample.json) ----
  function makeSample(){
    async function call(prompt, opts, json){
      const { data:{ session } } = await sb.auth.getSession();
      const r = await fetch("/api/ai", { method:"POST", headers:{ "Content-Type":"application/json", Authorization:"Bearer "+(session&&session.access_token||"") },
        body: JSON.stringify({ prompt, json, tier:(opts&&opts.modelTier)||"default" }) });
      if(r.status===429){ const e=new Error("Дневной лимит ИИ-запросов исчерпан, приходи завтра."); e.code="limit"; window.__toast&&window.__toast("⏳ Лимит ИИ на сегодня исчерпан"); throw e; }
      if(!r.ok){ const e=new Error("AI "+r.status); e.code = r.status===503?"not_granted":"ai_error"; throw e; }
      const rd = r.body.getReader(), dec = new TextDecoder(); let text="";
      for(;;){ const { value, done } = await rd.read(); if(done) break; text += dec.decode(value, {stream:true}); if(opts&&opts.onText) try{ opts.onText({text}); }catch(e){} }
      return text; }
    const sample = async (prompt, opts)=>({ text: await call(prompt, opts, false) });
    sample.json = async (prompt, opts)=>{ const t = await call(prompt, opts, true);
      const clean = t.replace(/^\s*```(?:json)?/i,"").replace(/```\s*$/,"").trim();
      try{ return JSON.parse(clean); }catch(e){}
      const a = clean.search(/[\[{]/), b = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
      if(a>=0 && b>a) return JSON.parse(clean.slice(a,b+1)); throw new Error("bad json"); };
    return sample; }

  // ---- screens ----
  function loginScreen(msg){
    show(`<h1>IELTS Academic</h1><p class="note">Курс подготовки на 6.5+: план на 28 недель, грамматика, слова, Reading, Writing, Speaking и пробники. Войди по почте, и прогресс будет на всех твоих устройствах.</p>
      <label class="note" for="g-email">Почта</label><input type="email" id="g-email" autocomplete="email" placeholder="you@example.com">
      <button class="btn" id="g-send" type="button" style="margin-top:10px;width:100%">Получить код</button>
      <div id="g-code-box" hidden style="margin-top:14px"><label class="note" for="g-code">Код из письма</label><input type="text" id="g-code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456">
      <button class="btn" id="g-verify" type="button" style="margin-top:10px;width:100%">Войти</button></div>
      <p class="sync" id="g-st">${esc(msg||"")}</p>`);
    const st=document.getElementById("g-st");
    document.getElementById("g-send").onclick = async ()=>{ const email=document.getElementById("g-email").value.trim(); if(!/^\S+@\S+\.\S+$/.test(email)){ st.textContent="Проверь адрес почты."; return; }
      st.textContent="Отправляю…"; const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.origin } });
      if(error){ st.textContent="Не получилось: "+error.message; return; }
      document.getElementById("g-code-box").hidden=false; st.textContent="Письмо отправлено. Введи код из письма или просто нажми ссылку в нём."; document.getElementById("g-code").focus(); };
    document.getElementById("g-verify").onclick = async ()=>{ const email=document.getElementById("g-email").value.trim(), token=document.getElementById("g-code").value.trim();
      st.textContent="Проверяю…"; const { data, error } = await sb.auth.verifyOtp({ email, token, type:"email" });
      if(error){ st.textContent="Код не подошёл: "+error.message; return; } user=data.user; afterLogin(); };
  }

  function profileScreen(db, prof){
    const t=new Date(); const nextMon = monday(new Date(t.getTime()+7*DAYMS)); const thisMon = monday(t);
    const p = prof || { name:"", start:isoD(nextMon), examDate:isoD(new Date(nextMon.getTime()+(27*7+1)*DAYMS)), level:"unknown", hours:12 };
    show(`<h1>${prof?"Профиль":"Настроим курс"}</h1><p class="note">План рассчитан на 28 недель. Под дату старта сайт расставит недели, задачи и пробники.</p>
      <label class="note" for="p-name">Как тебя зовут</label><input type="text" id="p-name" value="${esc(p.name)}" placeholder="Имя">
      <label class="note" for="p-start" style="margin-top:10px;display:block">Начать курс с недели</label>
      <select id="p-start"><option value="${isoD(thisMon)}">этой (с ${thisMon.toLocaleDateString("ru-RU")})</option><option value="${isoD(nextMon)}">следующей (с ${nextMon.toLocaleDateString("ru-RU")})</option>${prof&&![isoD(thisMon),isoD(nextMon)].includes(p.start)?`<option value="${esc(p.start)}">как сейчас (с ${parseD(p.start).toLocaleDateString("ru-RU")})</option>`:""}</select>
      <label class="note" for="p-exam" style="margin-top:10px;display:block">Дата экзамена (примерно)</label><input type="date" id="p-exam" value="${esc(p.examDate)}">
      <label class="note" for="p-level" style="margin-top:10px;display:block">Твой уровень сейчас</label>
      <select id="p-level">${[["unknown","Не знаю, пройду тест уровня"],["A2","A2 — простые фразы"],["B1","B1 — могу объясниться"],["B2","B2 — свободно, но с ошибками"]].map(([v,n])=>`<option value="${v}"${p.level===v?" selected":""}>${n}</option>`).join("")}</select>
      <label class="note" for="p-hours" style="margin-top:10px;display:block">Сколько часов в неделю готов заниматься</label><input type="number" id="p-hours" min="3" max="40" value="${esc(p.hours)}">
      <p class="note" id="p-warn"></p>
      <button class="btn" id="p-save" type="button" style="margin-top:6px;width:100%">${prof?"Сохранить":"Начать"}</button>${prof?'<button class="btn ghost" id="p-cancel" type="button" style="margin-top:8px;width:100%">Отмена</button>':""}`);
    const sel=document.getElementById("p-start"); sel.value=p.start;
    const warn=()=>{ const s=parseD(sel.value), e=parseD(document.getElementById("p-exam").value||"2100-01-01"); const w=Math.floor((e-s)/DAYMS/7)+1;
      document.getElementById("p-warn").textContent = w<28 ? `До экзамена ${w} нед. Это меньше плана: проходи недели быстрее, сайт разрешает открывать до 2 недель вперёд.` : ""; };
    sel.onchange=warn; document.getElementById("p-exam").onchange=warn; warn();
    if(prof) document.getElementById("p-cancel").onclick=()=>{ G.hidden=true; };
    document.getElementById("p-save").onclick = async ()=>{ const np={ name:document.getElementById("p-name").value.trim()||"Ученик", start:sel.value, examDate:document.getElementById("p-exam").value||p.examDate,
        level:document.getElementById("p-level").value, hours:Number(document.getElementById("p-hours").value)||12, updated:new Date().toISOString() };
      await db.doc("profile/main").set(np);
      const st=db.get("settings/main")||{}; if(st.examDate!==np.examDate) await db.doc("settings/main").set({...st, examDate:np.examDate});
      location.reload(); };
  }

  // ---- import a file exported from the Claude version ----
  const MAP = { weeks:"weeks", mocks:"mocks", words:"words", notes:"notes", ex:"exercises", essays:"essays", pics:"wordpics", reading:"reading", qgen:"quotes", qtests:"quotetests", spk:"speaking", reviews:"reviews" };
  async function importFile(db, file, st){
    try{ const j=JSON.parse(await file.text()); const s=j&&j.state; if(!s) throw new Error("Это не файл прогресса курса.");
      const rows=[]; Object.entries(MAP).forEach(([k,c])=>Object.entries(s[k]||{}).forEach(([id,data])=>{ if(data&&typeof data==="object") rows.push({coll:c,id,data}); }));
      if(s.settings) rows.push({coll:"settings",id:"main",data:s.settings}); if(s.placement&&Object.keys(s.placement).length) rows.push({coll:"placement",id:"result",data:s.placement});
      if(s.quiz) rows.push({coll:"quiz",id:"stats",data:s.quiz}); if(s.activity) rows.push({coll:"activity",id:"log",data:s.activity});
      if(s.ach) rows.push({coll:"achievements",id:"main",data:{got:s.ach}}); if(s.hl) rows.push({coll:"headlines",id:"stats",data:s.hl}); if(s.hlExtra&&s.hlExtra.length) rows.push({coll:"headlines",id:"extra",data:{items:s.hlExtra}});
      st.textContent="Загружаю "+rows.length+" записей…"; await db.bulk(rows);
      const own="ielts-app-state-"+user.id; try{ localStorage.removeItem(own); }catch(e){}
      st.textContent="Готово, перезагружаю…"; setTimeout(()=>location.reload(),600);
    }catch(e){ st.textContent="Не получилось: "+(e&&e.message||e); } }

  function accountPanel(db, prof){
    const set=document.getElementById("v-settings"); if(!set) return;
    const box=document.createElement("div"); box.className="panel"; box.id="acc-panel";
    box.innerHTML=`<h2>Аккаунт</h2><p class="note" style="margin:0 0 10px">${esc(prof.name)} · ${esc(user.email||"")}<br>Курс с ${parseD(prof.start).toLocaleDateString("ru-RU")}, экзамен ${parseD(prof.examDate).toLocaleDateString("ru-RU")}</p>
      <div class="row" style="gap:8px"><button class="btn ghost" type="button" id="acc-prof">Изменить профиль</button><button class="chip" type="button" id="acc-out">Выйти</button></div>
      <h3 style="margin:16px 0 6px">Перенести прогресс из версии в Claude</h3><p class="note" style="margin:0 0 8px">В старой версии открой Настройки → «Скачать мои данные», потом загрузи файл сюда.</p>
      <input type="file" id="acc-file" accept=".json,application/json"><div class="sync" id="acc-st"></div>`;
    set.insertBefore(box, set.firstChild);
    document.getElementById("acc-prof").onclick=()=>profileScreen(db, prof);
    document.getElementById("acc-out").onclick=async()=>{ await sb.auth.signOut(); location.reload(); };
    document.getElementById("acc-file").onchange=e=>{ const f=e.target.files[0]; if(f) importFile(db, f, document.getElementById("acc-st")); };
    const x=document.getElementById("xfer-panel"); if(x) x.querySelector("p").textContent="Скачай файл со всем прогрессом, чтобы сохранить копию или перенести на другой аккаунт.";
  }

  async function afterLogin(){
    show(`<p class="note">Загружаю твой прогресс…</p>`);
    const db = makeDb(user.id);
    try{ await db.ready(); }catch(e){ show(`<p>Не удалось загрузить данные: ${esc(e.message||e)}</p><button class="btn" onclick="location.reload()">Ещё раз</button>`); return; }
    const prof = db.get("profile/main");
    if(!prof){ profileScreen(db, null); return; }
    window.__UID = user.id; window.__PROFILE = prof; window.__START = parseD(prof.start);
    const sample = cfg.aiEnabled ? makeSample() : null;
    window.claude = { use: async name => name==="db" ? db : name==="sample" ? sample : null };
    G.hidden = true; document.getElementById("app-root").hidden = false;
    const sub=document.getElementById("course-sub"); if(sub){ const s=parseD(prof.start), e=parseD(prof.examDate); sub.textContent = prof.name+" · "+s.toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"})+" – "+e.toLocaleDateString("ru-RU",{month:"long",year:"numeric"}); }
    document.title = prof.name+" · IELTS 6.5";
    const src = document.getElementById("main-src").textContent; (0,eval)(src);
    accountPanel(db, prof);
  }

  async function start(){
    try{ cfg = await (await fetch("/api/config")).json(); }catch(e){ cfg=null; }
    if(!cfg || !cfg.supabaseUrl){ show(`<h1>Почти готово</h1><p>Сервер ещё не настроен: в Vercel не заданы SUPABASE_URL и SUPABASE_ANON_KEY. Инструкция в README.md.</p>`); return; }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
    const { data:{ session } } = await sb.auth.getSession();
    if(session && session.user){ user=session.user; afterLogin(); return; }
    loginScreen();
    sb.auth.onAuthStateChange((ev, s)=>{ if(ev==="SIGNED_IN" && s && !user){ user=s.user; afterLogin(); } });
  }
  if("serviceWorker" in navigator) window.addEventListener("load", ()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
  start();
})();
