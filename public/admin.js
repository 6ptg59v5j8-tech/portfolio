(() => {
  "use strict";
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const state = { settings:{}, socials:[], projects:[], skills:[], editingProject:null, editingSkill:null, galleryProject:null };
  const toast = $("#admin-toast");
  let toastTimer;
  function message(id, text, error=false) {
    const el = document.getElementById(id);
    if (el) { el.textContent = text || ""; el.classList.toggle("error", !!error); }
    if (text && /saved|uploaded|deleted/i.test(text) && !error && toast) {
      toast.textContent = "Changes saved";
      toast.classList.add("visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
    }
  }
  async function api(path, options={}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type","application/json");
    const response = await fetch("/api/"+path.replace(/^\/+/,""), {...options, headers, credentials:"same-origin", cache:"no-store"});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  function setView(loggedIn) {
    $("#auth-view").hidden = loggedIn;
    $("#dashboard").hidden = !loggedIn;
  }
  function tab(name) {
    $$(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name));
    ["content","projects","skills","announcements"].forEach(n=>{
      const panel=$("#panel-"+n); if(panel) panel.hidden=n!==name;
    });
  }
  function field(form,name,value) { const el=form.elements.namedItem(name); if(el) el.value=value ?? ""; }
  function val(form,name) { return form.elements.namedItem(name)?.value?.trim() ?? ""; }
  function safeImage(url, alt="Preview") {
    if(!url) return null;
    const img=document.createElement("img"); img.src=url; img.alt=alt; img.loading="lazy"; return img;
  }
  function preview(id,url,alt) {
    const el=$("#"+id); if(!el) return;
    el.replaceChildren();
    const img=safeImage(url,alt);
    if(img){ img.onerror=()=>{el.textContent="Image preview unavailable";}; el.append(img); }
    else { const p=document.createElement("span"); p.className="sub"; p.textContent="No image selected."; el.append(p); }
  }
  async function upload(file) {
    if(!file || !file.size) return "";
    const fd=new FormData(); fd.append("image",file);
    const result=await api("upload",{method:"POST",body:fd});
    return result.url;
  }
  async function loadContent() {
    const data=await api("content");
    state.settings=data.settings||{};
    state.socials=data.socials||[];
    const f=$("#content-form");
    ["name","eyebrow","hero_title","hero_intro","about_title","about_text","about_photo_url","availability_status","contact_title","email","location","contact_text","logo_url","favicon_url"].forEach(k=>field(f,k,state.settings[k]));
    if(!state.settings.availability_status) field(f,"availability_status","available");
    renderSocials();
    preview("about-photo-admin-preview",state.settings.about_photo_url,"About portrait");
    preview("logo-preview",state.settings.logo_url,"Logo");
    preview("favicon-preview",state.settings.favicon_url,"Favicon");
    return data;
  }
  function renderSocials() {
    const box=$("#social-editor"); if(!box) return; box.replaceChildren();
    state.socials.forEach((item,i)=>{
      const row=document.createElement("div"); row.className="social-row";
      const label=document.createElement("input"); label.placeholder="Label"; label.value=item.label||"";
      const url=document.createElement("input"); url.placeholder="https://"; url.value=item.url||"";
      const del=document.createElement("button"); del.type="button"; del.textContent="Remove"; del.addEventListener("click",()=>{state.socials.splice(i,1);renderSocials();});
      label.addEventListener("input",()=>item.label=label.value); url.addEventListener("input",()=>item.url=url.value);
      row.append(label,url,del); box.append(row);
    });
  }
  async function saveContent(e) {
    e.preventDefault(); const f=e.currentTarget; const s={...state.settings};
    ["name","eyebrow","hero_title","hero_intro","about_title","about_text","about_photo_url","availability_status","contact_title","email","location","contact_text","logo_url","favicon_url"].forEach(k=>s[k]=val(f,k));
    try {
      for(const [fileKey,urlKey] of [["about_photo_file","about_photo_url"],["logo_file","logo_url"],["favicon_file","favicon_url"]]) {
        const file=f.elements.namedItem(fileKey)?.files?.[0];
        if(file) s[urlKey]=await upload(file);
      }
      await api("content",{method:"PUT",body:JSON.stringify({settings:s,socials:state.socials})});
      state.settings=s;
      field(f,"about_photo_url",s.about_photo_url); field(f,"logo_url",s.logo_url); field(f,"favicon_url",s.favicon_url);
      ["about_photo_file","logo_file","favicon_file"].forEach(k=>{if(f.elements.namedItem(k))f.elements.namedItem(k).value="";});
      preview("about-photo-admin-preview",s.about_photo_url,"About portrait");
      preview("logo-preview",s.logo_url,"Logo"); preview("favicon-preview",s.favicon_url,"Favicon");
      message("content-status","Changes saved.");
    } catch(err){message("content-status",err.message,true);}
  }
  async function loadProjects() {
    const d=await api("projects"); state.projects=Array.isArray(d)?d:(d.projects||[]);
    const list=$("#project-list"); list.replaceChildren();
    state.projects.forEach(p=>{
      const row=document.createElement("div"); row.className="project-row";
      const info=document.createElement("div"); const h=document.createElement("h3"); h.textContent=p.title; const meta=document.createElement("p"); meta.textContent=[p.category,p.project_date,p.slug].filter(Boolean).join(" · "); info.append(h,meta);
      const actions=document.createElement("div"); actions.className="project-actions";
      const edit=document.createElement("button"); edit.type="button"; edit.textContent="Edit"; edit.onclick=()=>editProject(p);
      const del=document.createElement("button"); del.type="button"; del.textContent="Delete"; del.onclick=async()=>{if(!confirm(`Delete ${p.title}?`))return;try{await api(`projects/${encodeURIComponent(p.id)}`,{method:"DELETE"});await loadProjects();message("project-status","Project deleted.");}catch(e){message("project-status",e.message,true);}};
      actions.append(edit,del);row.append(info,actions);list.append(row);
    });
  }
  function editProject(p=null) {
    state.editingProject=p; const f=$("#project-form"); f.reset();
    $("#project-editor").hidden=false; $("#project-editor-title").textContent=p?"Edit project":"Add project";
    ["id","title","category","project_date","slug","venue","role","description","credits","image_url","project_url"].forEach(k=>field(f,k,p?.[k]));
    state.galleryProject=p?.id||null; renderGallery(p?.id);
    $("#project-editor").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function renderGallery(id) {
    const box=$("#gallery-editor"); box.replaceChildren();
    if(!id){box.textContent="Save the project first before adding gallery photographs.";$("#upload-gallery-photos").disabled=true;return;}
    $("#upload-gallery-photos").disabled=false;
    try {
      const d=await api(`projects/slug/${encodeURIComponent(state.projects.find(p=>p.id===id)?.slug||"")}`);
      const photos=d.photos||[];
      if(!photos.length){box.textContent="No gallery photographs uploaded yet.";return;}
      photos.forEach(photo=>{
        const row=document.createElement("div");row.className="project-row";
        const img=safeImage(photo.image_url,photo.alt_text||"Gallery photo"); if(img){img.style.maxWidth="100px";img.style.maxHeight="75px";}
        const del=document.createElement("button");del.type="button";del.textContent="Remove";del.onclick=async()=>{try{await api(`projects/${id}/photos/${photo.id}`,{method:"DELETE"});await renderGallery(id);message("project-status","Photo deleted.");}catch(e){message("project-status",e.message,true);}};
        row.append(img||document.createTextNode("Photo"),del);box.append(row);
      });
    } catch(e){box.textContent="Gallery will be available after the project has been saved.";}
  }
  async function saveProject(e) {
    e.preventDefault();const f=e.currentTarget;const d={};
    ["title","category","project_date","slug","venue","role","description","credits","image_url","project_url"].forEach(k=>d[k]=val(f,k));
    try {
      const file=f.elements.namedItem("image_file").files[0];if(file)d.image_url=await upload(file);
      const id=val(f,"id");
      if(id) await api(`projects/${encodeURIComponent(id)}`,{method:"PUT",body:JSON.stringify(d)});
      else {const result=await api("projects",{method:"POST",body:JSON.stringify(d)});d.id=result.id;}
      state.editingProject={...d,id:d.id||id};
      f.elements.namedItem("id").value=d.id;
      await loadProjects();state.galleryProject=d.id;await renderGallery(d.id);
      message("project-status","Project saved.");
    }catch(err){message("project-status",err.message,true);}
  }
  async function uploadGallery() {
    const id=val($("#project-form"),"id");const files=[...$("#project-form").elements.namedItem("gallery_files").files];
    if(!id||!files.length){message("project-status","Save the project and choose photographs first.",true);return;}
    try{for(const file of files){const url=await upload(file);await api(`projects/${id}/photos`,{method:"POST",body:JSON.stringify({image_url:url,alt_text:"Production photograph"})});}
      $("#project-form").elements.namedItem("gallery_files").value="";await renderGallery(id);message("project-status","Photographs uploaded.");
    }catch(e){message("project-status",e.message,true);}
  }
  async function loadSkills() {
    const d=await api("admin/skills");state.skills=d.skills||[];
    const list=$("#skills-list");list.replaceChildren();
    state.skills.forEach(skill=>{
      const row=document.createElement("div");row.className="project-row";
      const info=document.createElement("div");const h=document.createElement("h3");h.textContent=skill.name;const p=document.createElement("p");p.textContent=[skill.category,skill.experience_level,Number(skill.is_visible)?"Visible":"Hidden"].filter(Boolean).join(" · ");info.append(h,p);
      const actions=document.createElement("div");actions.className="project-actions";
      const edit=document.createElement("button");edit.type="button";edit.textContent="Edit";edit.onclick=()=>editSkill(skill);
      const del=document.createElement("button");del.type="button";del.textContent="Delete";del.onclick=async()=>{if(!confirm(`Delete ${skill.name}?`))return;try{await api(`skills/${skill.id}`,{method:"DELETE"});await loadSkills();message("skill-status","Skill deleted.");}catch(e){message("skill-status",e.message,true);}};
      actions.append(edit,del);row.append(info,actions);list.append(row);
    });
  }
  function editSkill(s=null) {
    state.editingSkill=s;const f=$("#skill-form");f.reset();$("#skill-editor").hidden=false;$("#skill-editor-title").textContent=s?"Edit skill":"Add skill";
    ["id","name","category","description","experience_level","image_url"].forEach(k=>field(f,k,s?.[k]));
    f.elements.namedItem("is_visible").checked=s?!!Number(s.is_visible):true;
    $("#skill-editor").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function saveSkill(e) {
    e.preventDefault();const f=e.currentTarget;const d={};
    ["name","category","description","experience_level","image_url"].forEach(k=>d[k]=val(f,k));
    d.is_visible=f.elements.namedItem("is_visible").checked;
    try{const file=f.elements.namedItem("image_file").files[0];if(file)d.image_url=await upload(file);
      const id=val(f,"id");await api(id?`skills/${id}`:"skills",{method:id?"PUT":"POST",body:JSON.stringify(d)});
      await loadSkills();message("skill-status","Skill saved.");
    }catch(e){message("skill-status",e.message,true);}
  }
  function addBannerMessage(value="") {
    const row=document.createElement("div");row.className="banner-message-row";
    const input=document.createElement("input");input.type="text";input.maxLength=180;input.placeholder="Write an announcement";input.value=value;
    const remove=document.createElement("button");remove.type="button";remove.textContent="Remove";remove.onclick=()=>row.remove();
    row.append(input,remove);$("#banner-message-list").append(row);
  }
  async function loadAnnouncements() {
    const s=state.settings;const f=$("#announcement-form");
    f.elements.namedItem("banner_enabled").checked=s.banner_enabled==="true";
    field(f,"banner_background",s.banner_background||"#20211e");
    field(f,"banner_text_colour",s.banner_text_colour||"#ffffff");
    field(f,"banner_speed",s.banner_speed||"7");
    let messages=[];try{messages=JSON.parse(s.banner_messages||"[]");}catch{}
    $("#banner-message-list").replaceChildren();(messages.length?messages:[""]).forEach(addBannerMessage);updateBannerPreview();
  }
  function updateBannerPreview() {
    const f=$("#announcement-form");const p=$("#banner-preview");
    const messages=$$(".banner-message-row input",$("#banner-message-list")).map(x=>x.value.trim()).filter(Boolean);
    p.textContent=messages.join("  ✳  ")||"Your announcement will appear here";
    p.style.background=f.elements.namedItem("banner_background").value;
    p.style.color=f.elements.namedItem("banner_text_colour").value;
  }
  async function saveAnnouncements(e) {
    e.preventDefault();const f=e.currentTarget;const s={...state.settings};
    s.banner_enabled=f.elements.namedItem("banner_enabled").checked?"true":"false";
    s.banner_messages=JSON.stringify($$(".banner-message-row input",$("#banner-message-list")).map(x=>x.value.trim()).filter(Boolean));
    s.banner_background=val(f,"banner_background");s.banner_text_colour=val(f,"banner_text_colour");s.banner_speed=val(f,"banner_speed");
    try{await api("content",{method:"PUT",body:JSON.stringify({settings:s,socials:state.socials})});state.settings=s;message("announcement-status","Announcement banner saved.");}
    catch(e){message("announcement-status",e.message,true);}
  }
  async function dashboard() {
    setView(true);
    try{await loadContent();await loadProjects();await loadSkills();await loadAnnouncements();}
    catch(e){console.error(e);message("content-status",e.message,true);}
  }
  $("#login-form").addEventListener("submit",async e=>{
    e.preventDefault();const f=e.currentTarget;message("login-message","");
    try{await api("login",{method:"POST",body:JSON.stringify({email:val(f,"email"),password:f.elements.namedItem("password").value})});f.reset();await dashboard();}
    catch(err){message("login-message",err.message,true);}
  });
  $("#logout-button").addEventListener("click",async()=>{try{await api("logout",{method:"POST",body:"{}"});}catch{}setView(false);});
  $$(".tab").forEach(b=>b.addEventListener("click",()=>tab(b.dataset.tab)));
  $("#content-form").addEventListener("submit",saveContent);
  $("#add-social").addEventListener("click",()=>{state.socials.push({label:"",url:""});renderSocials();});
  $("#new-project").addEventListener("click",()=>editProject());
  $("#cancel-project").addEventListener("click",()=>$("#project-editor").hidden=true);
  $("#project-form").addEventListener("submit",saveProject);
  $("#upload-gallery-photos").addEventListener("click",uploadGallery);
  $("#new-skill").addEventListener("click",()=>editSkill());
  $("#cancel-skill").addEventListener("click",()=>$("#skill-editor").hidden=true);
  $("#skill-form").addEventListener("submit",saveSkill);
  $("#announcement-form").addEventListener("submit",saveAnnouncements);
  $("#add-banner-message").addEventListener("click",()=>addBannerMessage());
  ["banner_background","banner_text_colour"].forEach(k=>$("#announcement-form").elements.namedItem(k).addEventListener("input",updateBannerPreview));
  $("#banner-message-list").addEventListener("input",updateBannerPreview);
  api("status").then(d=>{if(d.authenticated)dashboard();}).catch(e=>console.warn("Admin status:",e));
})();