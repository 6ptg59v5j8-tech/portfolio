(() => {
  "use strict";
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const state = { settings:{}, socials:[], projects:[], skills:[], education:[], editingProject:null, editingSkill:null, editingEducation:null, galleryProject:null };
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
    ["content","projects","skills","education","announcements","labels","account"].forEach(n=>{
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
  function mk(tag, props={}, ...kids) {
    const e=document.createElement(tag); Object.assign(e,props); kids.forEach(k=>e.append(k)); return e;
  }
  function btn(text, onclick, opts={}) {
    const b=mk("button",{type:"button",textContent:text,onclick,disabled:!!opts.disabled}); if(opts.label)b.setAttribute("aria-label",opts.label); return b;
  }
  async function move(list, index, dir, endpoint, reload) {
    const ids=list.map(x=>x.id), j=index+dir; if(j<0||j>=ids.length) return;
    [ids[index],ids[j]]=[ids[j],ids[index]];
    try { await api(endpoint,{method:"PUT",body:JSON.stringify({ids})}); await reload(); }
    catch(err){ alert(err.message); }
  }
  function listRow(list, i, o) {
    const info=mk("div",{}, mk("h3",{textContent:o.title}), mk("p",{textContent:o.meta}));
    const actions=mk("div",{className:"project-actions"});
    if(o.reorder){
      actions.append(
        btn("↑",()=>move(list,i,-1,o.reorder.endpoint,o.reorder.reload),{disabled:i===0,label:"Move up"}),
        btn("↓",()=>move(list,i,1,o.reorder.endpoint,o.reorder.reload),{disabled:i===list.length-1,label:"Move down"}));
    }
    actions.append(btn("Edit",o.onEdit), btn("Delete",async()=>{
      if(!confirm(`Delete ${o.title}?`)) return;
      try { await o.onDelete(); } catch(err){ alert(err.message); }
    }));
    return mk("div",{className:"project-row"},info,actions);
  }

  async function loadContent() {
    const data=await api("content");
    state.settings=data.settings||{};
    state.socials=data.socials||[];
    const f=$("#content-form");
    ["name","eyebrow","hero_title","hero_intro","about_title","about_text","about_photo_url","availability_status","status_button_enabled","status_button_label","status_button_text","status_button_url","contact_title","email","location","contact_text","logo_url","favicon_url"].forEach(k=>field(f,k,state.settings[k]));
    if(!state.settings.availability_status) field(f,"availability_status","available");
    if(!state.settings.status_button_enabled) field(f,"status_button_enabled","false");
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
    ["name","eyebrow","hero_title","hero_intro","about_title","about_text","about_photo_url","availability_status","status_button_enabled","status_button_label","status_button_text","status_button_url","contact_title","email","location","contact_text","logo_url","favicon_url"].forEach(k=>s[k]=val(f,k));
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
    const d=await api("admin/projects"); state.projects=d.projects||[];
    const list=$("#project-list"); list.replaceChildren();
    if(!state.projects.length){ list.append(mk("p",{className:"sub",textContent:"No projects yet."})); return; }
    if(state.settings.project_order!=="manual") list.append(mk("p",{className:"sub",textContent:"Your website currently shows projects newest first, by project date. The arrows below only change the public order if you set Project order to Manual in Page text & sections. Projects without a date appear last."}));
    state.projects.forEach((p,i)=>list.append(listRow(state.projects,i,{
      title:p.title+(Number(p.is_visible)===0?"  (hidden draft)":""),
      meta:[p.category,p.project_date,p.slug].filter(Boolean).join(" | "),
      reorder:{endpoint:"projects/reorder",reload:loadProjects},
      onEdit:()=>editProject(p),
      onDelete:async()=>{await api(`projects/${encodeURIComponent(p.id)}`,{method:"DELETE"});await loadProjects();}
    })));
  }
  function editProject(p=null) {
    state.editingProject=p; const f=$("#project-form"); f.reset();
    $("#project-editor").hidden=false; $("#project-editor-title").textContent=p?"Edit project":"Add project";
    ["id","title","category","project_date","slug","venue","role","description","credits","image_url","project_url"].forEach(k=>field(f,k,p?.[k]));
    f.elements.namedItem("is_visible").checked=p?Number(p.is_visible??1)!==0:true;
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
      const reload=()=>renderGallery(id);
      photos.forEach((photo,i)=>{
        const img=safeImage(photo.image_url,photo.alt_text||"Gallery photo"); if(img){img.style.maxWidth="100px";img.style.maxHeight="75px";}
        const alt=mk("input",{value:photo.alt_text||"",placeholder:"Describe this photo (alt text)",maxLength:200});
        alt.addEventListener("change",async()=>{try{await api(`projects/${id}/photos/${photo.id}`,{method:"PUT",body:JSON.stringify({alt_text:alt.value})});message("project-status","Photo description saved.");}catch(err){message("project-status",err.message,true);}});
        const actions=mk("div",{className:"project-actions"},
          btn("↑",()=>move(photos,i,-1,`projects/${id}/photos/reorder`,reload),{disabled:i===0,label:"Move up"}),
          btn("↓",()=>move(photos,i,1,`projects/${id}/photos/reorder`,reload),{disabled:i===photos.length-1,label:"Move down"}),
          btn("Remove",async()=>{try{await api(`projects/${id}/photos/${photo.id}`,{method:"DELETE"});await reload();}catch(err){message("project-status",err.message,true);}}));
        box.append(mk("div",{className:"project-row"},img||document.createTextNode("Photo"),alt,actions));
      });
    } catch(e){box.textContent="Gallery will be available after the project has been saved.";}
  }
  async function saveProject(e) {
    e.preventDefault();const f=e.currentTarget;const d={};
    ["title","category","project_date","slug","venue","role","description","credits","image_url","project_url"].forEach(k=>d[k]=val(f,k));
    d.is_visible=f.elements.namedItem("is_visible").checked;
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
    $("#skill-categories").replaceChildren(...[...new Set(["Lighting","Sound","Technical","Production",...state.skills.map(x=>x.category)])].map(c=>mk("option",{value:c})));
    if(!state.skills.length) list.append(mk("p",{className:"sub",textContent:"No skills added yet."}));
    state.skills.forEach((skill,i)=>list.append(listRow(state.skills,i,{
      title:skill.name,
      meta:[skill.category,skill.experience_level,Number(skill.is_visible)?"Visible":"Hidden"].filter(Boolean).join(" | "),
      reorder:{endpoint:"skills/reorder",reload:loadSkills},
      onEdit:()=>editSkill(skill),
      onDelete:async()=>{await api(`skills/${skill.id}`,{method:"DELETE"});await loadSkills();}
    })));
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

  async function loadEducation() {
    const d=await api("admin/education");state.education=d.education||[];
    const list=$("#education-list-admin");list.replaceChildren();
    if(!state.education.length){list.append(mk("p",{className:"sub",textContent:"No qualifications added yet."}));return;}
    state.education.forEach((entry,i)=>list.append(listRow(state.education,i,{
      title:entry.qualification,
      meta:[entry.institution,[entry.start_date,entry.end_date].filter(Boolean).join(" | "),Number(entry.is_visible)?"Visible":"Hidden"].filter(Boolean).join(" | "),
      reorder:{endpoint:"education/reorder",reload:loadEducation},
      onEdit:()=>editEducation(entry),
      onDelete:async()=>{await api(`education/${encodeURIComponent(entry.id)}`,{method:"DELETE"});await loadEducation();}
    })));
  }
  function editEducation(entry=null){
    state.editingEducation=entry;const f=$("#education-form");f.reset();$("#education-editor").hidden=false;
    $("#education-editor-title").textContent=entry?"Edit qualification":"Add qualification";
    ["id","qualification","institution","start_date","end_date","description"].forEach(k=>field(f,k,entry?.[k]));
    f.elements.namedItem("is_visible").checked=entry?!!Number(entry.is_visible):true;
    $("#education-editor").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function saveEducation(e){
    e.preventDefault();const f=e.currentTarget;const d={};
    ["qualification","institution","start_date","end_date","description"].forEach(k=>d[k]=val(f,k));
    d.is_visible=f.elements.namedItem("is_visible").checked;
    try{const id=val(f,"id");await api(id?`education/${encodeURIComponent(id)}`:"education",{method:id?"PUT":"POST",body:JSON.stringify(d)});$("#education-editor").hidden=true;await loadEducation();message("education-status","Qualification saved.");}
    catch(e){message("education-status",e.message,true);}
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
  // ---- Page text, sections and account ----
  const LABEL_GROUPS = [
    {title:"Sections", hint:"Untick a section to hide it (and its menu link) from your website.",
      toggles:[["show_work","Selected work"],["show_about","About"],["show_skills","Skills"],["show_education","Education tab (inside Skills)"],["show_contact","Contact"]]},
    {title:"Website basics",
      fields:[["wordmark_text","Logo text (used when no logo image is set)","DB"],["site_title","Browser tab title","Daniel Burden | Portfolio"],["meta_description","Description shown in search results","The personal portfolio of Daniel Burden, selected work, skills and contact.",true]]},
    {title:"Menu", fields:[["nav_work","Work","Work"],["nav_about","About","About"],["nav_skills","Skills","Skills"],["nav_contact","Contact","Contact"]]},
    {title:"Selected work section",
      fields:[["work_kicker","Small heading","SELECTED WORK"],["work_title","Main heading","Selected|productions"],["work_note","Side note","A selection of productions and the work behind them.",true],["card_button","Project card button","Find out more"],["work_empty","Message when there are no projects","Projects will appear here soon."]],
      order:true},
    {title:"About section", fields:[["about_kicker","Small heading","A LITTLE ABOUT ME"]]},
    {title:"Skills and education section",
      fields:[["skills_kicker","Small heading","WHAT I DO"],["tab_skills","Skills tab","Skills"],["tab_education","Education tab","Education"],["skills_title","Skills heading","Skills &|technical experience"],["skills_note","Skills note","The skills and knowledge I bring|to productions and live events.",true],["education_title","Education heading","Education"],["education_note","Education note","My academic background|and formal training.",true]]},
    {title:"Contact and footer",
      fields:[["contact_kicker","Contact small heading","THE NEXT THING"],["back_to_top","Back to top link","BACK TO TOP ↑"],["footer_tagline","Footer tagline","LIGHTING · SOUND · PRODUCTION ARTS"]]},
    {title:"Project pages",
      fields:[["label_back_to_work","Back link","← Back to selected work"],["label_gallery","Gallery heading","GALLERY"],["label_venue","Venue label","Venue"],["label_role","Role label","Role"],["label_credits","Credits label","Credits"],["label_visit_project","External project link","Visit project website ↗"],["label_previous_project","Previous project label","← PREVIOUS PROJECT"],["label_next_project","Next project label","NEXT PROJECT →"],["project_footer_text","Footer text","DESIGNED WITH DBAVL.CO.UK"],["project_footer_link","Footer link","ALL PROJECTS ↑"]]}
  ];
  function loadLabels() {
    const box=$("#labels-fields"); if(!box) return; box.replaceChildren();
    const s=state.settings;
    LABEL_GROUPS.forEach(g=>{
      box.append(mk("div",{className:"wide"},mk("hr"),mk("h3",{textContent:g.title}),...(g.hint?[mk("p",{className:"sub",textContent:g.hint})]:[])));
      (g.toggles||[]).forEach(([k,text])=>{
        const input=mk("input",{type:"checkbox",name:k,checked:s[k]!=="false"});
        box.append(mk("label",{className:"switch-label"},input,document.createTextNode(" Show "+text)));
      });
      (g.fields||[]).forEach(([k,text,def,area])=>{
        const input=area?mk("textarea",{name:k,rows:2}):mk("input",{name:k});
        input.value=s[k]||""; input.placeholder=def; input.maxLength=k==="meta_description"?300:160;
        box.append(mk("label",{className:area?"wide":""},document.createTextNode(text),input));
      });
      if(g.order){
        const sel=mk("select",{name:"project_order"},mk("option",{value:"newest",textContent:"Newest first (by project date)"}),mk("option",{value:"manual",textContent:"Manual (use the arrows in the Projects tab)"}));
        sel.value=s.project_order==="manual"?"manual":"newest";
        box.append(mk("label",{className:"wide"},document.createTextNode("Project order"),sel));
      }
    });
  }
  async function saveLabels(e) {
    e.preventDefault(); const f=e.currentTarget; const s={...state.settings};
    LABEL_GROUPS.forEach(g=>{
      (g.toggles||[]).forEach(([k])=>{s[k]=f.elements.namedItem(k).checked?"true":"false";});
      (g.fields||[]).forEach(([k])=>{s[k]=f.elements.namedItem(k).value.trim();});
    });
    s.project_order=f.elements.namedItem("project_order").value;
    try {
      await api("content",{method:"PUT",body:JSON.stringify({settings:s,socials:state.socials})});
      state.settings=s; await loadProjects(); message("labels-status","Changes saved.");
    } catch(err){ message("labels-status",err.message,true); }
  }
  async function accountSubmit(e, endpoint, build, statusId, done) {
    e.preventDefault(); const f=e.currentTarget;
    try {
      const body=build(f); if(!body) return;
      await api(endpoint,{method:"POST",body:JSON.stringify(body)}); f.reset(); message(statusId,done);
    } catch(err){ message(statusId,err.message,true); }
  }

  async function dashboard() {
    setView(true);
    try{await loadContent();await loadProjects();await loadSkills();await loadEducation();await loadAnnouncements();loadLabels();}
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
  $("#new-education").addEventListener("click",()=>editEducation());
  $("#cancel-education").addEventListener("click",()=>$("#education-editor").hidden=true);
  $("#education-form").addEventListener("submit",saveEducation);
  $("#cancel-skill").addEventListener("click",()=>$("#skill-editor").hidden=true);
  $("#skill-form").addEventListener("submit",saveSkill);
  $("#announcement-form").addEventListener("submit",saveAnnouncements);
  $("#labels-form").addEventListener("submit",saveLabels);
  $("#reset-labels").addEventListener("click",()=>{ $$("#labels-form input[type=text],#labels-form input:not([type]),#labels-form textarea").forEach(x=>{x.value="";}); message("labels-status","Boxes cleared. Press Save changes to restore the defaults."); });
  $("#email-form").addEventListener("submit",e=>accountSubmit(e,"account/email",f=>({email:val(f,"email"),current_password:f.elements.namedItem("current_password").value}),"email-status","Email saved. Use it next time you sign in."));
  $("#password-form").addEventListener("submit",e=>accountSubmit(e,"account/password",f=>{
    if(f.elements.namedItem("new_password").value!==f.elements.namedItem("confirm_password").value){message("password-status","The new passwords do not match.",true);return null;}
    return {current_password:f.elements.namedItem("current_password").value,new_password:f.elements.namedItem("new_password").value};
  },"password-status","Password saved. Other devices have been signed out."));
  $("#add-banner-message").addEventListener("click",()=>addBannerMessage());
  ["banner_background","banner_text_colour"].forEach(k=>$("#announcement-form").elements.namedItem(k).addEventListener("input",updateBannerPreview));
  $("#banner-message-list").addEventListener("input",updateBannerPreview);
  api("status").then(d=>{if(d.authenticated)dashboard();}).catch(e=>console.warn("Admin status:",e));
})();