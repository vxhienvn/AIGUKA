
async function api(path, opts={}){
  const headers=opts.body instanceof FormData ? {} : {'Content-Type':'application/json'};
  const timeoutMs=Number(opts.timeoutMs||15000);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  let r;
  try{
    r=await fetch('/api/ai-ops'+path,{headers,...opts,signal:controller.signal});
  }catch(e){
    if(e&&e.name==='AbortError') throw new Error(`API timeout ${timeoutMs}ms: ${path}. Backend/Supabase đang treo, không để UI đơ nữa.`);
    throw e;
  }finally{clearTimeout(timer)}
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):{}}catch(e){
    const brief=text.slice(0,220).replace(/\s+/g,' ');
    throw new Error(`API ${r.status} không trả JSON. Có thể sai route/backend chưa deploy/body quá lớn. Response: ${brief}`);
  }
  if(!r.ok || data.ok===false) throw new Error(data.error||data.message||`API lỗi ${r.status}`);
  return data;
}
function showLoadError(targetId, error, label='Lỗi tải dữ liệu'){
  const el=document.getElementById(targetId);
  if(!el)return;
  el.innerHTML=`<div class="card report red" style="padding:12px"><b>${escapeHtml(label)}</b><br><span class="muted">${escapeHtml(error?.message||error||'Không rõ lỗi')}</span><div style="margin-top:8px"><button class="btn secondary" onclick="refreshAll()">Thử tải lại</button></div></div>`;
}
async function safeLoad(fn, fallbackTarget, label){
  try{return await fn()}catch(e){console.error('[AI_CENTER_LOAD_ERROR]',label,e); if(fallbackTarget)showLoadError(fallbackTarget,e,label);}
}
function escapeHtml(s){return String(s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
const titleMap={multi:['Multi AI','Quản lý vai trò Active / Monitor / Learning / Evaluate / Propose.'],upload:['Upload tài liệu','Đưa catalog, bảng giá, ảnh, video để AI tạo bản nháp kiến thức.'],processing:['AI đang học','Theo dõi tài liệu đang xử lý và kết quả nhận diện.'],review:['Chờ duyệt','Duyệt bản nháp trước khi bot được dùng.'],knowledge:['Knowledge','Kiến thức đã được duyệt cho bot dùng.'],experience:['Dạy kinh nghiệm','Truyền kinh nghiệm bán hàng và case thực tế cho bot.'],conversation:['Hội thoại học tập','Load hội thoại thật để 3 AI cùng đánh giá và rút kinh nghiệm.'],monitor:['AI Monitor','Báo cáo lỗi, cảnh báo và đánh giá hội thoại.'],compare:['AI Compare','So sánh câu trả lời giữa OpenAI, Gemini và DeepSeek.'],diagnostics:['AI Diagnostics','Kiểm tra API, model, timeout và lỗi từng nền tảng.']};
function showTab(id,el){document.querySelectorAll('.tabpane').forEach(x=>x.classList.add('hidden'));const pane=document.getElementById('tab-'+id);if(pane)pane.classList.remove('hidden');document.querySelectorAll('.side-link').forEach(x=>x.classList.remove('active'));const idx={multi:0,upload:1,processing:2,review:3,knowledge:4,experience:5,conversation:6,monitor:7,compare:8,diagnostics:9}[id];document.querySelectorAll('.side-link')[idx]?.classList.add('active');if(el)el.classList.add('active');document.getElementById('pageTitle').textContent=titleMap[id]?.[0]||'AI Center';document.getElementById('pageSub').textContent=titleMap[id]?.[1]||'';if(id==='knowledge')safeLoad(loadKnowledge,'knowledgeItems','Lỗi tải Knowledge');if(id==='experience')safeLoad(loadExperiences,'experienceItems','Lỗi tải kinh nghiệm');if(id==='review')safeLoad(loadReviewItems,'reviewItems','Lỗi tải chờ duyệt');if(id==='processing')safeLoad(loadLearningItems,'learningItems','Lỗi tải tài liệu học');if(id==='monitor')safeLoad(loadReports,'reports','Lỗi tải báo cáo');if(id==='diagnostics')safeLoad(()=>runDiagnostics(false),'diagnosticsResult','Lỗi diagnostics');}
function badge(mode){return `<span class="badge ${String(mode).toLowerCase()}">${mode}</span>`}
function roleLabel(r){return {active:'Active',monitor:'Monitor',learning:'Learning',evaluate:'Evaluate',propose:'Propose'}[r]||r}
function roleHelp(r){return {active:'Được quyền trả lời khách',monitor:'Giám sát lỗi hội thoại',learning:'Đọc tài liệu / tạo nháp kiến thức',evaluate:'Chấm điểm câu trả lời',propose:'Đề xuất câu tốt hơn / kinh nghiệm mới'}[r]||''}
function sw(providerId, role, value){return `<div class="role-row"><div><b>${roleLabel(role)}</b><div class="muted">${roleHelp(role)}</div></div><div class="switch ${value?'on':''}" onclick="setRole('${providerId}','${role}',${value?'false':'true'})"></div></div>`}
function persistenceBadge(p){const source=p?.source||'';if(source==='supabase'||source==='supabase+local_cache')return '<div class="muted" style="margin-top:8px;color:#15803d;font-weight:800">✓ Đã lưu Supabase</div>';if(source==='local_cache_no_remote')return '<div class="muted" style="margin-top:8px;color:#b45309;font-weight:800">⚠ Đang dùng cache local, chưa có bản Supabase</div>';return '<div class="muted" style="margin-top:8px;color:#b91c1c;font-weight:800">✕ Chưa xác nhận lưu Supabase</div>'}
async function loadSettings(){const data=await api('/settings');const rt=data.runtime||{};const persist=data.persistence||{};const providers=Object.values(rt);const activeCount=providers.filter(p=>p.roles&&p.roles.active).length;document.getElementById('providers').innerHTML=`<div class="card ${persist.source==='supabase'?'report green':'report orange'}" style="margin-bottom:12px;padding:10px"><b>Provider Persistence:</b> ${persist.source==='supabase'?'✓ Đã load từ Supabase':'⚠ '+(persist.source||'unknown')} ${persist.supabase?.reason?(' - '+persist.supabase.reason):''}</div>`+providers.map(p=>`<div class="provider"><h3>${p.label} ${badge(p.mode)}</h3><div class="muted">Model: <b>${p.model||'-'}</b></div><div class="muted">API: ${p.hasApiKey?'Đã cấu hình':'Thiếu key'} ${p.maskedKey||''}</div>${!p.hasApiKey?'<div class="report red card" style="padding:8px;margin:8px 0">Thiếu API key nên role bật cũng chưa chạy được.</div>':''}${sw(p.id,'active',!!p.roles?.active)}${sw(p.id,'monitor',!!p.roles?.monitor)}${sw(p.id,'learning',!!p.roles?.learning)}${sw(p.id,'evaluate',!!p.roles?.evaluate)}${sw(p.id,'propose',!!p.roles?.propose)}<div class="row" style="margin-top:10px"><button class="btn" onclick="setMode('${p.id}','ACTIVE')">Preset ACTIVE</button><button class="btn secondary" onclick="setMode('${p.id}','MONITOR')">Preset MONITOR</button><button class="btn danger" onclick="setMode('${p.id}','OFF')">OFF hết</button></div>${persistenceBadge(persist)}</div>`).join('');if(activeCount!==1){document.getElementById('providers').insertAdjacentHTML('afterbegin',`<div class="report orange card" style="padding:10px">Hiện có ${activeCount} nền tảng Active. Nên chỉ để 1 nền tảng Active để tránh loạn giọng.</div>`)} }
async function setRole(id,role,enabled){const r=await api(`/provider/${id}/role`,{method:'POST',body:JSON.stringify({role,enabled})});if(!r.persistence?.supabase?.ok)alert('Cảnh báo: chưa lưu được Supabase, deploy có thể mất cấu hình. '+(r.persistence?.supabase?.error||r.persistence?.supabase?.reason||''));loadSettings()}
async function setMode(id,mode){const r=await api(`/provider/${id}/mode`,{method:'POST',body:JSON.stringify({mode})});if(!r.persistence?.supabase?.ok)alert('Cảnh báo: chưa lưu được Supabase, deploy có thể mất cấu hình. '+(r.persistence?.supabase?.error||r.persistence?.supabase?.reason||''));loadSettings()}
async function loadSummary(){const data=await api('/learning/summary');const s=data.summary||{};const rows=[['Tài liệu chờ duyệt',s.todayTodo?.documents||0],['Cần xử lý',s.todayTodo?.needsAttention||0],['Nhận diện yếu',s.todayTodo?.lowConfidence||0],['Kinh nghiệm chờ áp dụng',s.todayTodo?.experiencesNeedReview||0],['Knowledge đã duyệt',s.approvedKnowledge||0],['Đã hấp thụ',s.absorption?.absorbed||0],['Cần OCR/Parser',s.absorption?.needsExtraction||0]];document.getElementById('todayTodo').innerHTML=rows.map(([label,val])=>`<div class="box"><div class="kpi">${val}</div><b>${label}</b></div>`).join('');document.getElementById('sideTodo').innerHTML=rows.map(([label,val])=>`<div class="small-row"><span>${label}</span><b>${val}</b></div>`).join('');}
async function setLearningActive(active){await api('/learning/settings',{method:'POST',body:JSON.stringify({active,autoProcess:true,targetDays:7,requireApproval:true})});loadLearningItems();loadSummary()}
let learningTimer=null;function debouncedLoadLearning(){clearTimeout(learningTimer);learningTimer=setTimeout(loadLearningItems,300)}
async function loadLearningItems(){const st=document.getElementById('learningStatusFilter')?.value||'';const q=document.getElementById('learningQ')?.value||'';const data=await api(`/learning/items?limit=200&status=${encodeURIComponent(st)}&q=${encodeURIComponent(q)}`);const settings=data.settings||{};const items=data.items||[];const el=document.getElementById('learningStatus');if(el)el.textContent=` Trạng thái: ${settings.active?'Đang học':'Tạm dừng'} | Auto: ${settings.autoProcess?'ON':'OFF'} | Mục tiêu ${settings.targetDays||7} ngày`;document.getElementById('learningItems').innerHTML=items.map(renderLearningItem).join('')||'<p class="muted">Chưa có tài liệu.</p>';loadSummary();}
async function loadReviewItems(){const data=await api('/learning/items?limit=200');const items=(data.items||[]).filter(x=>['pending_review','needs_attention','uploaded'].includes(x.status||''));document.getElementById('reviewItems').innerHTML=items.map(renderLearningItem).join('')||'<p class="muted">Không có mục chờ duyệt.</p>';loadSummary();}
function levelClass(conf,status){if(status==='approved')return 'green';if(status==='rejected')return 'red';return Number(conf||0)>=80?'green':Number(conf||0)>=55?'yellow':Number(conf||0)>=30?'orange':'red'}
function renderLearningItem(item){const draft=item.draft||item.learningResult?.draft||{};const status=item.status||'uploaded';const cls=levelClass(draft.confidence_0_100,status);const products=(draft.detected_products||[]).map(p=>p.name||'').filter(Boolean).slice(0,5).join(', ');return `<div class="learnitem report ${cls} card"><b>${escapeHtml(item.filename)}</b> <span class="pill">${escapeHtml(status)}</span><div class="muted">${escapeHtml(item.mimeType||'')} • ${Math.round((item.size||0)/1024)}KB • ${escapeHtml(item.createdAt||'')} • Confidence ${draft.confidence_0_100??'-'}</div><div>${escapeHtml(draft.summary||'Chưa có bản nháp.')}</div>${draft.detected_category?`<div><b>Nhóm:</b> ${escapeHtml(draft.detected_category)}</div>`:''}${products?`<div><b>Sản phẩm:</b> ${escapeHtml(products)}</div>`:''}${(draft.missing_info||[]).length?`<div class="muted"><b>Thiếu:</b> ${escapeHtml((draft.missing_info||[]).join(', '))}</div>`:''}<div class="actions"><button class="btn secondary" onclick="processLearningItem('${item.id}')">Xử lý lại</button><button class="btn green" onclick="setLearningStatus('${item.id}','approved')">Duyệt vào Knowledge</button><button class="btn danger" onclick="setLearningStatus('${item.id}','rejected')">Từ chối</button></div><details><summary>Xem JSON</summary><pre>${escapeHtml(JSON.stringify(draft||item,null,2))}</pre></details></div>`}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);})}
function formatBytes(n){const v=Number(n||0);if(v>=1024*1024)return (v/1024/1024).toFixed(1)+'MB';if(v>=1024)return Math.round(v/1024)+'KB';return v+'B'}
function uploadRisk(file){
  const mb=file.size/1024/1024;
  const name=String(file.name||'').toLowerCase();
  const isPdf=name.endsWith('.pdf')||String(file.type||'').includes('pdf');
  if(mb>30) return {blocked:true,level:'danger',message:`File ${formatBytes(file.size)} quá lớn để upload trực tiếp. Hãy tách/nén trước, khuyến nghị mỗi phần dưới 30MB.`};
  if(isPdf&&mb>20) return {blocked:false,level:'warn',message:`PDF ${formatBytes(file.size)} khá lớn. Nếu treo lâu, hãy tách/nén xuống dưới 20-30MB.`};
  return {blocked:false,level:'ok',message:'Dung lượng phù hợp để upload trực tiếp.'};
}
function renderUploadPlan(files){
  const rows=[...files].map((f,i)=>{const r=uploadRisk(f);const icon=r.blocked?'❌':r.level==='warn'?'⚠️':'✅';return `<div class="small-row"><span>${icon} ${i+1}. ${escapeHtml(f.name)} <span class="muted">${formatBytes(f.size)}</span></span><span>${escapeHtml(r.message)}</span></div>`}).join('');
  return `<div class="card" style="margin-top:8px;padding:10px"><b>Kiểm tra trước upload</b>${rows}</div>`;
}

async function ensurePdfLib(){
  if(window.PDFLib) return window.PDFLib;
  const status=document.getElementById('uploadStatus');
  if(status)status.insertAdjacentHTML('beforeend','<div class="report yellow card" style="padding:10px;margin-top:8px">Đang tải thư viện tách PDF...</div>');
  await new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-pdf-lib="1"]');
    if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}
    const sc=document.createElement('script');
    sc.src='https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    sc.dataset.pdfLib='1';
    sc.onload=resolve;
    sc.onerror=()=>reject(new Error('Không tải được thư viện tách PDF. Kiểm tra internet hoặc CDN.'));
    document.head.appendChild(sc);
  });
  if(!window.PDFLib) throw new Error('Không khởi tạo được PDFLib.');
  return window.PDFLib;
}
function makePartName(name,part,total){
  const dot=name.lastIndexOf('.');
  const base=dot>0?name.slice(0,dot):name;
  return `${base}_part_${String(part).padStart(2,'0')}_of_${String(total).padStart(2,'0')}.pdf`;
}
async function createPdfPartFromPages(src, indexes, title){
  const {PDFDocument}=await ensurePdfLib();
  const doc=await PDFDocument.create();
  const copied=await doc.copyPages(src,indexes);
  copied.forEach(pg=>doc.addPage(pg));
  doc.setTitle(title||'AIGUKA PDF part');
  return await doc.save({useObjectStreams:true});
}

async function estimatePdfPageSizes(src, fileName, onProgress){
  const totalPages=src.getPageCount();
  const pages=[];
  for(let i=0;i<totalPages;i++){
    if(onProgress) onProgress(`Đang đo dung lượng trang ${i+1}/${totalPages}...`);
    const bytes=await createPdfPartFromPages(src,[i],`${fileName} page ${i+1}`);
    pages.push({index:i, pageNo:i+1, bytes:bytes.byteLength});
    // nhường UI để trình duyệt không treo với file nhiều trang
    if(i%3===0) await new Promise(r=>setTimeout(r,0));
  }
  return pages;
}

function packContiguousPagesBySize(pages, targetBytes, hardBytes){
  const groups=[];
  let cur=[];
  let curSize=0;
  for(const pg of pages){
    // Nếu trang đơn lẻ đã vượt hard limit thì phải đứng riêng để báo rõ, không ghép thêm.
    if(pg.bytes>hardBytes){
      if(cur.length){groups.push(cur);cur=[];curSize=0;}
      groups.push([pg]);
      continue;
    }
    if(cur.length && curSize + pg.bytes > targetBytes){
      groups.push(cur);
      cur=[];
      curSize=0;
    }
    cur.push(pg);
    curSize += pg.bytes;
  }
  if(cur.length) groups.push(cur);
  return groups;
}

async function splitPdfFileSmart(file, targetPartMb=18, hardLimitMb=30, onProgress){
  const {PDFDocument}=await ensurePdfLib();
  const bytes=await file.arrayBuffer();
  const src=await PDFDocument.load(bytes,{ignoreEncryption:true});
  const totalPages=src.getPageCount();
  if(onProgress) onProgress(`PDF có ${totalPages} trang. Đang phân tích dung lượng từng trang...`);
  const targetBytes=targetPartMb*1024*1024;
  const hardBytes=hardLimitMb*1024*1024;
  const pageSizes=await estimatePdfPageSizes(src,file.name,onProgress);
  const groups=packContiguousPagesBySize(pageSizes,targetBytes,hardBytes);
  const total=groups.length;
  const out=[];
  for(let i=0;i<groups.length;i++){
    const g=groups[i];
    const first=g[0].pageNo;
    const last=g[g.length-1].pageNo;
    if(onProgress) onProgress(`Đang tạo part ${i+1}/${total} - trang ${first}${last!==first?`-${last}`:''}...`);
    const indexes=g.map(x=>x.index);
    const outBytes=await createPdfPartFromPages(src,indexes,`${file.name} pages ${first}-${last}`);
    const f=new File([outBytes], makePartName(file.name,i+1,total), {
      type:'application/pdf',
      lastModified:Date.now()
    });
    f._aigukaPageStart=first;
    f._aigukaPageEnd=last;
    f._aigukaOriginalFile=file.name;
    f._aigukaTotalParts=total;
    f._aigukaSingleHeavyPage=(g.length===1 && g[0].bytes>hardBytes);
    out.push(f);
    if(i%2===0) await new Promise(r=>setTimeout(r,0));
  }
  return out;
}

// Giữ tên cũ để các đoạn code trước không vỡ, nhưng đổi hẳn sang thuật toán smart-by-size.
async function splitPdfFile(file, maxPartMb=18){
  return await splitPdfFileSmart(file,maxPartMb,30);
}

async function splitPdfFileDeep(file, targetPartMb=18, hardLimitMb=30, maxDepth=1, onProgress){
  // V7.1.0: bỏ tách đệ quy theo số trang. Dùng một lần phân tích dung lượng từng trang rồi pack theo bytes.
  const parts=await splitPdfFileSmart(file,targetPartMb,hardLimitMb,onProgress);
  return parts;
}

function setInputFiles(files){
  const input=document.getElementById('learningFiles');
  const dt=new DataTransfer();
  files.forEach(f=>dt.items.add(f));
  input.files=dt.files;
}
async function splitLargePdfFiles(){
  const input=document.getElementById('learningFiles');
  const status=document.getElementById('uploadStatus');
  const files=[...(input.files||[])];
  if(!files.length){alert('Chọn PDF lớn trước nhé');return;}
  const pdfs=files.filter(f=>String(f.name||'').toLowerCase().endsWith('.pdf')||String(f.type||'').includes('pdf'));
  const others=files.filter(f=>!pdfs.includes(f));
  const large=pdfs.filter(f=>f.size>30*1024*1024);
  if(!large.length){alert('Không có PDF nào trên 30MB cần tách.');return;}
  try{
    if(status)status.innerHTML=`${renderUploadPlan(files)}<div class="report yellow card" style="padding:10px;margin-top:8px">Đang tách ${large.length} PDF lớn ngay trên trình duyệt. Không đóng tab...</div>`;
    const newFiles=[...others, ...pdfs.filter(f=>f.size<=30*1024*1024)];
    for(let i=0;i<large.length;i++){
      const f=large[i];
      if(status)status.innerHTML=`${renderUploadPlan(files)}<div class="report yellow card" style="padding:10px;margin-top:8px">Đang tách PDF ${i+1}/${large.length}: <b>${escapeHtml(f.name)}</b> (${formatBytes(f.size)})...</div>`;
      const parts=await splitPdfFileDeep(f,18,30,1,(msg)=>{ if(status)status.innerHTML=`${renderUploadPlan(files)}<div class="report yellow card" style="padding:10px;margin-top:8px">${escapeHtml(msg)}</div>`; });
      newFiles.push(...parts);
      const overs=parts.filter(x=>x.size>30*1024*1024);
      if(status)status.innerHTML=`<div class="report ${overs.length?'yellow':'green'} card" style="padding:10px;margin-top:8px">✅ Đã tách <b>${escapeHtml(f.name)}</b> thành ${parts.length} phần:<br>${parts.map(x=>`${x.size>30*1024*1024?'⚠️ ':'✅ '}${escapeHtml(x.name)} (${formatBytes(x.size)})`).join('<br>')}${overs.length?'<br><b>Còn phần quá lớn do trang PDF/ảnh scan quá nặng. Cần nén PDF/ảnh trước khi upload.</b>':''}</div>`;
    }
    setInputFiles(newFiles);
    if(status)status.innerHTML=`${renderUploadPlan(newFiles)}<div class="report green card" style="padding:10px;margin-top:8px"><b>Đã tách xong.</b><br>Bạn có thể bấm <b>Upload & cho AI học</b> để upload các phần đã tách. Mỗi phần sẽ được lưu như tài liệu riêng, tên file có part để nhận diện cùng một catalogue.</div>`;
  }catch(e){
    if(status)status.innerHTML=`${renderUploadPlan(files)}<div class="report red card" style="padding:10px;margin-top:8px">❌ Không tách được PDF: ${escapeHtml(e.message||String(e))}<br><span class="muted">Nếu PDF bị mã hóa, scan quá nặng hoặc trình duyệt thiếu RAM, hãy tách/nén thủ công bằng công cụ ngoài rồi upload lại.</span></div>`;
    alert('Không tách được PDF: '+(e.message||String(e)));
  }
}

function makeChunkUploadId(file){
  return 'chunk_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)+'_'+String(file.name||'file').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,60);
}
async function uploadFileByChunks(file, note, status, files, fileIndex){
  const chunkSize = 8 * 1024 * 1024; // dưới 10MB để tránh Render/proxy 520
  const total = Math.ceil(file.size / chunkSize);
  const uploadId = makeChunkUploadId(file);
  let finalResult = null;
  for(let part=0; part<total; part++){
    const start = part * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const blob = file.slice(start, end, file.type || 'application/octet-stream');
    const fd = new FormData();
    fd.append('chunk', blob, `${file.name}.chunk_${String(part+1).padStart(4,'0')}_of_${String(total).padStart(4,'0')}`);
    fd.append('uploadId', uploadId);
    fd.append('index', String(part));
    fd.append('total', String(total));
    fd.append('filename', file.name);
    fd.append('mimeType', file.type || 'application/octet-stream');
    fd.append('note', note || '');
    fd.append('sourceType', 'upload_chunked');
    if(status){
      const pct = Math.round(((part) / total) * 100);
      status.innerHTML = `${renderUploadPlan(files)}<div class="report yellow card" style="padding:10px;margin-top:8px">Đang upload chia dung lượng ${fileIndex+1}/${files.length}: <b>${escapeHtml(file.name)}</b><br>Chunk ${part+1}/${total} (${formatBytes(blob.size)}), tiến độ ${pct}%<br><span class="muted">Mỗi chunk dưới 10MB. Server sẽ tự ghép lại thành file gốc, không giảm chất lượng ảnh/PDF.</span></div>`;
    }
    finalResult = await api('/learning/upload-chunk',{method:'POST',body:fd});
  }
  return finalResult;
}

async function uploadLearningFiles(){
  const files=[...document.getElementById('learningFiles').files];
  const note=document.getElementById('learningNote').value;
  const status=document.getElementById('uploadStatus');
  if(!files.length){alert('Chọn file trước nhé');return}
  if(status)status.innerHTML=renderUploadPlan(files);
  const target=document.getElementById('learningItems');
  if(target)target.innerHTML='Đang upload và cho AI học...';
  let ok=0, fail=0;
  for(let i=0;i<files.length;i++){
    const file=files[i];
    try{
      if(file.size > 10*1024*1024){
        await uploadFileByChunks(file, note, status, files, i);
      }else{
        if(status)status.innerHTML=`${renderUploadPlan(files)}<div class="report yellow card" style="padding:10px;margin-top:8px">Đang upload ${i+1}/${files.length}: <b>${escapeHtml(file.name)}</b> (${formatBytes(file.size)})...<br><span class="muted">Không đóng trang trong lúc upload.</span></div>`;
        const fd=new FormData();
        fd.append('file', file, file.name);
        fd.append('note', note||'');
        fd.append('sourceType','upload');
        await api('/learning/upload-file',{method:'POST',body:fd});
      }
      ok++;
      if(status)status.innerHTML=`${renderUploadPlan(files)}<div class="report green card" style="padding:10px;margin-top:8px">✅ Đã upload ${ok}/${files.length}: <b>${escapeHtml(file.name)}</b>. File lớn được ghép lại trên server, không giảm chất lượng.</div>`;
    }catch(e){
      fail++;
      const hint=String(e.message||'').includes('không trả JSON')||String(e.message||'').includes('520')?'Backend/proxy trả HTML, thường do route chưa deploy hoặc server restart. Kiểm tra deploy bản 7.1.1 và Ctrl+F5.':'';
      if(status)status.innerHTML=`${renderUploadPlan(files)}<div class="report red card" style="padding:10px;margin-top:8px">❌ Lỗi upload ${escapeHtml(file.name)}: ${escapeHtml(e.message)}${hint?'<br><b>Gợi ý:</b> '+escapeHtml(hint):''}</div>`;
      alert('Lỗi upload '+file.name+': '+e.message+(hint?'\n'+hint:''));
    }
  }
  loadLearningItems();loadReviewItems();loadSummary();
  if(status)status.insertAdjacentHTML('beforeend',`<div class="report ${fail?'yellow':'green'} card" style="padding:10px;margin-top:8px"><b>Hoàn tất upload.</b> Thành công: ${ok}, lỗi: ${fail}.</div>`);
}

async function processLearningItem(id){await api(`/learning/item/${id}/process`,{method:'POST',body:JSON.stringify({})});loadLearningItems();loadReviewItems()}
async function setLearningStatus(id,status){await api(`/learning/item/${id}/status`,{method:'POST',body:JSON.stringify({status})});loadLearningItems();loadReviewItems();loadKnowledge();loadSummary()}
let knowledgeTimer=null;function debouncedLoadKnowledge(){clearTimeout(knowledgeTimer);knowledgeTimer=setTimeout(loadKnowledge,300)}
function absorptionLabel(status){return status==='absorbed'?'Đã hấp thụ':status==='partial'?'Hấp thụ một phần':status==='needs_extraction'?'Cần trích xuất/OCR':'Chưa hấp thụ'}

function clearBrainObjectForm(){
  ['brainTitle','brainCategory','brainAliases','brainContent','brainJson'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  const st=document.getElementById('brainSaveStatus'); if(st)st.textContent='';
}
async function saveBrainObject(){
  const title=document.getElementById('brainTitle')?.value||'';
  const content=document.getElementById('brainContent')?.value||'';
  if(!title.trim()||!content.trim()){alert('Cần nhập tiêu đề và nội dung tri thức.');return;}
  const body={
    objectType:document.getElementById('brainObjectType')?.value||'business_rule',
    title,
    category:document.getElementById('brainCategory')?.value||'',
    productGroup:document.getElementById('brainCategory')?.value||'',
    priority:Number(document.getElementById('brainPriority')?.value||4),
    aliases:(document.getElementById('brainAliases')?.value||'').split(/[,\n]/).map(x=>x.trim()).filter(Boolean),
    content,
    objectJson:document.getElementById('brainJson')?.value||'',
    source:'admin_direct_ai_brain'
  };
  const st=document.getElementById('brainSaveStatus');
  try{
    if(st)st.textContent=' Đang lưu vào AI Brain...';
    const data=await api('/learning/brain-object/add',{method:'POST',body:JSON.stringify(body)});
    if(st)st.textContent=' Đã lưu vào AI Brain / Supabase';
    await loadKnowledge(); await loadSummary();
  }catch(e){
    if(st)st.textContent=' Lỗi: '+(e.message||String(e));
    alert(e.message||String(e));
  }
}

async function absorbKnowledge(documentId){if(!documentId)return alert('Không có document_id để hấp thụ lại.');const ok=confirm('Chạy lại Knowledge Absorption cho tài liệu này?');if(!ok)return;await api(`/learning/knowledge/${encodeURIComponent(documentId)}/absorb`,{method:'POST',body:JSON.stringify({})});await loadKnowledge();await loadSummary();}
async function loadKnowledge(){const q=document.getElementById('knowledgeQ')?.value||'';const data=await api(`/learning/knowledge?limit=200&q=${encodeURIComponent(q)}`);document.getElementById('knowledgeItems').innerHTML=(data.items||[]).map(k=>{const d=k.draft||{};const st=d.absorption_status||'not_absorbed';const score=d.absorption_score_0_100;const products=(d.detected_products||[]).map(p=>p.name||p.model||p.code||'').filter(Boolean).slice(0,8).join(', ');const faqs=(d.sales_faq||[]).slice(0,3).map(x=>`<div class="absorb-mini"><b>${escapeHtml(x.q||'FAQ')}</b><br>${escapeHtml(x.a||'')}</div>`).join('');return `<div class="card report ${st==='absorbed'?'green':st==='partial'?'yellow':'orange'}"><b>${escapeHtml(k.filename||k.id)}</b> <span class="pill">${escapeHtml(k.source||'local')}</span> <span class="absorb-badge ${escapeHtml(st)}">${absorptionLabel(st)}${score!=null?' • '+score+'/100':''}</span><div class="muted">${escapeHtml(k.createdAt||'')} ${d.detected_category?'• '+escapeHtml(d.detected_category):''}</div><p>${escapeHtml(d.summary||'')}</p>${products?`<div><b>Sản phẩm AI đã rút ra:</b> ${escapeHtml(products)}</div>`:''}${(d.missing_info||[]).length?`<div class="muted"><b>Thiếu:</b> ${escapeHtml((d.missing_info||[]).join(', '))}</div>`:''}${faqs?`<div class="absorb-grid">${faqs}</div>`:''}<div class="actions"><button class="btn secondary" onclick="absorbKnowledge('${escapeHtml(k.documentId||d.metadata?.document_id||k.id||'')}')">Hấp thụ lại</button></div><details><summary>Xem dữ liệu hấp thụ</summary><pre>${escapeHtml(JSON.stringify(d,null,2))}</pre></details></div>`}).join('')||'<p class="muted">Chưa có knowledge đã duyệt.</p>'}
async function saveExperience(){const body={title:document.getElementById('expTitle').value,type:document.getElementById('expType').value,appliesTo:document.getElementById('expApply').value,priority:Number(document.getElementById('expPriority').value),lesson:document.getElementById('expLesson').value,wrongExample:document.getElementById('expWrong').value,rightExample:document.getElementById('expRight').value,status:'draft'};await api('/learning/experience',{method:'POST',body:JSON.stringify(body)});document.getElementById('expStatus').textContent=' Đã lưu';loadExperiences();loadSummary()}
let expTimer=null;function debouncedLoadExperiences(){clearTimeout(expTimer);expTimer=setTimeout(loadExperiences,300)}
async function loadExperiences(){const q=document.getElementById('expQ')?.value||'';const data=await api(`/learning/experiences?limit=200&q=${encodeURIComponent(q)}`);document.getElementById('experienceItems').innerHTML=(data.items||[]).map(x=>`<div class="card report ${x.status==='applied'?'green':'yellow'}"><b>${escapeHtml(x.title)}</b> <span class="pill">${escapeHtml(x.status||'draft')}</span><div class="muted">${escapeHtml(x.type)} • ${escapeHtml(x.appliesTo)} • Ưu tiên ${x.priority}</div><div>${escapeHtml(x.lesson)}</div>${x.wrongExample?`<details><summary>Ví dụ sai</summary><pre>${escapeHtml(x.wrongExample)}</pre></details>`:''}${x.rightExample?`<details><summary>Ví dụ đúng</summary><pre>${escapeHtml(x.rightExample)}</pre></details>`:''}<button class="btn green" onclick="setExperienceStatus('${x.id}','applied')">Đánh dấu đã áp dụng</button></div>`).join('')||'<p class="muted">Chưa có kinh nghiệm.</p>'}
async function setExperienceStatus(id,status){await api(`/learning/experience/${id}/status`,{method:'POST',body:JSON.stringify({status})});loadExperiences();loadSummary()}
let selectedConversation=null;
async function searchConversations(){const q=document.getElementById('convQ').value.trim();const list=document.getElementById('conversationList');list.innerHTML='<div class="empty-state" style="grid-column:1/-1">Đang tìm hội thoại...</div>';const data=await api(`/conversations/search?q=${encodeURIComponent(q)}&limit=50`);const conversations=data.conversations||[];if(!conversations.length){list.innerHTML='<div class="empty-state" style="grid-column:1/-1">Không tìm thấy hội thoại. Thử tìm bằng SĐT, tên khách, PSID, Ad ID hoặc một câu trong hội thoại.</div>';return}list.innerHTML=conversations.map((c,i)=>`<div class="conversation-result" id="convResult-${i}" onclick="selectConversation(${i})"><b>${escapeHtml(c.title)}</b><div class="muted">${escapeHtml(c.source)} • ${c.length||0} ký tự</div><div class="mini">${escapeHtml((c.preview||'').slice(0,180))}${(c.preview||'').length>180?'...':''}</div></div>`).join('');window._conversationResults=conversations;selectConversation(0)}
function selectConversation(i){const c=(window._conversationResults||[])[i]; if(!c)return;selectedConversation=c;document.querySelectorAll('.conversation-result').forEach(x=>x.classList.remove('selected'));const selected=document.getElementById('convResult-'+i); if(selected)selected.classList.add('selected');document.getElementById('evaluateBtn').disabled=false;document.getElementById('selectedConvTitle').textContent=c.title||'Hội thoại';document.getElementById('selectedConvMeta').textContent=`Nguồn: ${c.source||'-'} • Độ dài: ${c.length||0} ký tự • ID: ${c.id||'-'}`;document.getElementById('selectedCustomerInfo').innerHTML=`<div class="customer-avatar"></div><b>${escapeHtml(c.title||'Khách')}</b><div>Nguồn: ${escapeHtml(c.source||'-')}</div><div>ID: ${escapeHtml(c.id||'-')}</div><div>Độ dài: ${c.length||0} ký tự</div><span class="pill" style="background:#dcfce7;color:#166534">Sẵn sàng đánh giá</span>`;renderTimelinePreview(c.preview||'');document.getElementById('conversationEval').innerHTML='<div class="empty-state" style="grid-column:1/-1">Đã chọn hội thoại. Bấm “3 AI đánh giá”.</div>';document.getElementById('conversationConsensus').innerHTML=''}
function renderTimelinePreview(text){const lines=String(text||'').split(/\n+/).filter(Boolean).slice(0,80);if(!lines.length){document.getElementById('selectedTimeline').innerHTML='<div class="empty-state">Không có nội dung preview.</div>';return}document.getElementById('selectedTimeline').innerHTML=lines.map(line=>{const lower=line.toLowerCase();let cls='system';if(lower.startsWith('khách')||lower.includes('customer')) cls='customer';else if(lower.startsWith('bot')||lower.includes(' bot:')) cls='bot';else if(lower.startsWith('sale')||lower.includes('nhân viên')||lower.includes('admin')) cls='sale';return `<div class="msg ${cls}">${escapeHtml(line)}</div>`;}).join('')}
function expandConversationBox(){document.body.classList.toggle('wide-mode')}
async function evaluateSelectedConversation(){if(!selectedConversation){alert('Chọn hội thoại trước');return}await evaluateConversation(encodeURIComponent(selectedConversation.id))}
async function evaluateConversation(encodedId){const id=decodeURIComponent(encodedId);const box=document.getElementById('conversationEval');const consensus=document.getElementById('conversationConsensus');box.innerHTML='<div class="empty-state" style="grid-column:1/-1">Đang gửi hội thoại cho OpenAI, Gemini và DeepSeek đánh giá...</div>';consensus.innerHTML='';const data=await api(`/conversations/${encodeURIComponent(id)}/evaluate`,{method:'POST',body:JSON.stringify({})});if(!data.ok){box.innerHTML='<div class="report red card" style="grid-column:1/-1">'+escapeHtml(data.error||'Lỗi')+'</div>';return}const results=data.results||[];box.innerHTML=normalizeThreeProviders(results).map(renderAiReviewCard).join('');consensus.innerHTML=renderConsensus(results)}
function normalizeThreeProviders(results){const providers=['openai','gemini','deepseek'];return providers.map(name=>results.find(r=>(r.provider||'').toLowerCase().includes(name))||{provider:name,ok:false,error:'Chưa có kết quả từ nền tảng này.'})}
function extractScore(text, ok){if(!ok)return null;const m=String(text||'').match(/(\d+(?:[\.,]\d+)?)\s*\/\s*10/);if(m)return Math.min(10,Math.max(0,Number(m[1].replace(',','.'))));let score=8;const t=String(text||'').toLowerCase();['sai','lỗi','chưa','không','hỏi lại','quên','thiếu'].forEach(k=>{if(t.includes(k))score-=0.35});return Math.max(5.5,Math.min(9.2,score))}
function stars(score){if(score==null)return '—';const full=Math.round(score/2);return '★★★★★'.slice(0,full)+'☆☆☆☆☆'.slice(0,5-full)}
function splitReview(text){const out={good:[],bad:[],suggest:[],other:[]};String(text||'').split(/\n+/).map(x=>x.trim()).filter(Boolean).forEach(line=>{const clean=line.replace(/^[-*#\d.)\s]+/,'').trim();const l=clean.toLowerCase();if(!clean)return;if(l.includes('điểm mạnh')||l.includes('tốt')||l.includes('đúng'))out.good.push(clean);else if(l.includes('lỗi')||l.includes('sai')||l.includes('chưa')||l.includes('không nên')||l.includes('quên')||l.includes('thiếu'))out.bad.push(clean);else if(l.includes('đề xuất')||l.includes('nên')||l.includes('cần')||l.includes('gợi ý'))out.suggest.push(clean);else out.other.push(clean)});return out}
function listHtml(items, empty){return items.length?`<ul>${items.slice(0,6).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:`<p class="muted">${empty}</p>`}
function renderAiReviewCard(r){const provider=(r.provider||'AI').toLowerCase();const key=provider.includes('openai')?'openai':provider.includes('gemini')?'gemini':provider.includes('deepseek')?'deepseek':'ai';const label=key==='openai'?'OpenAI':key==='gemini'?'Google Gemini':key==='deepseek'?'DeepSeek Chat':r.provider;if(!r.ok){return `<div class="ai-card"><h3><span class="ai-head-left"><span class="ai-logo ${key}">${label[0]}</span>${escapeHtml(label)}</span><span class="badge status-bad">Lỗi</span></h3><div class="review-section bad"><h4>🔴 Không đánh giá được</h4><p>${escapeHtml(r.error||'Không có kết quả.')}</p></div></div>`}const score=extractScore(r.text,true);const parts=splitReview(r.text||'');const level=score>=8.2?'status-good':score>=7?'status-warn':'status-bad';return `<div class="ai-card"><h3><span class="ai-head-left"><span class="ai-logo ${key}">${label[0]}</span>${escapeHtml(label)}</span><span class="badge ${level}">${score>=8.2?'Tốt':score>=7?'Cần xem':'Yếu'}</span></h3><div class="score">${score.toFixed(1)} <small>/10</small></div><div class="stars">${stars(score)}</div><div class="review-section good"><h4>🟢 Điểm mạnh</h4>${listHtml(parts.good,'Chưa nêu rõ điểm mạnh.')}</div><div class="review-section bad"><h4>🟠 Cần cải thiện</h4>${listHtml(parts.bad,'Chưa phát hiện lỗi lớn.')}</div><div class="review-section suggest"><h4>💡 Đề xuất</h4>${listHtml(parts.suggest,'Chưa có đề xuất cụ thể.')}</div><button class="btn ghost" onclick="prefillExperience(${JSON.stringify((r.text||'').slice(0,1200))})">Xem chi tiết đánh giá →</button><details class="raw-toggle"><summary>Xem bản gốc</summary><pre>${escapeHtml(r.text||'')}</pre></details></div>`}
function renderConsensus(results){const texts=results.filter(r=>r.ok).map(r=>String(r.text||'').toLowerCase()).join('\n');if(!texts)return '';const issues=[];if(texts.includes('hỏi lại'))issues.push('Bot có xu hướng hỏi lại điều đã biết.');if(texts.includes('báo giá')||texts.includes('giá'))issues.push('Cần xử lý câu hỏi giá rõ hơn, ưu tiên báo khoảng giá nếu có dữ liệu.');if(texts.includes('slide')||texts.includes('mẫu')||texts.includes('album'))issues.push('Cần kiểm tra việc gửi mẫu/slide khi khách yêu cầu xem.');if(texts.includes('sản phẩm'))issues.push('Cần củng cố Context Builder để nhận diện đúng sản phẩm trước khi trả lời.');if(texts.includes('sđt')||texts.includes('zalo'))issues.push('Cần kiểm tra trạng thái đã có SĐT/Zalo để không xin lại.');const summary=issues.length?issues:['Ba AI đã có đánh giá. Cần đọc chi tiết để rút kinh nghiệm cụ thể.'];const lesson=summary.join('\n');const scores=results.filter(r=>r.ok).map(r=>extractScore(r.text,true)).filter(Boolean);const avg=scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1):'-';return `<div class="consensus-card"><div><h3>AI Consensus <span class="muted">(Tổng hợp từ 3 nền tảng)</span></h3><div class="score" style="color:#16a34a">${avg} <small>/10</small> <span class="stars">${avg!=='-'?stars(Number(avg)):''}</span></div><ul>${summary.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div><div class="row"><button class="btn" onclick="prefillExperience(${JSON.stringify(lesson)})">⭐ Lưu thành kinh nghiệm</button><button class="btn ghost">Tạo bài học nâng cao</button></div></div>`}
function prefillExperience(text){showTab('experience');document.getElementById('expTitle').value='Kinh nghiệm từ hội thoại thật';document.getElementById('expLesson').value=text}
async function compareModels(){const prompt=document.getElementById('comparePrompt').value;const box=document.getElementById('compareResults');box.innerHTML='Đang gọi model...';const data=await api('/compare',{method:'POST',body:JSON.stringify({prompt})});box.innerHTML=(data.results||[]).map(r=>`<div class="card"><h3>${escapeHtml(r.provider)}</h3>${r.ok?`<pre>${escapeHtml(r.text)}</pre>`:`<pre>${escapeHtml(r.error)}</pre>`}</div>`).join('')}
async function loadReports(){const level=document.getElementById('levelFilter')?.value||'';const q=document.getElementById('qFilter')?.value||'';const data=await api(`/reports?level=${encodeURIComponent(level)}&q=${encodeURIComponent(q)}&limit=100`);document.getElementById('reports').innerHTML=(data.reports||[]).map(r=>`<div class="card report ${r.level||'yellow'}"><b>${escapeHtml(r.type||'monitor')} — ${escapeHtml(r.provider||'')}</b><div class="muted">${escapeHtml(r.createdAt||'')}</div><div>Score: ${r.score??r.score_0_100??'-'} | Level: ${escapeHtml(r.level||'-')}</div><pre>${escapeHtml(JSON.stringify(r,null,2))}</pre></div>`).join('')||'<p class="muted">Chưa có báo cáo.</p>'}

// ===== V7.0.7 Stable UI/UX overrides =====
let providerVisibility={openai:true,gemini:true,deepseek:true};
function taskStart(title,steps=[]){const p=document.getElementById('globalTaskPanel');if(!p)return;p.classList.remove('hidden');window._taskSteps=steps.map(x=>({label:x,status:'todo'}));document.getElementById('taskTitle').textContent=title;document.getElementById('taskSub').textContent='Đang bắt đầu...';document.getElementById('taskLog').textContent='';taskRender(0);}
function taskLog(msg,status='info'){const box=document.getElementById('taskLog');if(box)box.textContent+=`${new Date().toLocaleTimeString('vi-VN')}  ${msg}\n`;const sub=document.getElementById('taskSub');if(sub)sub.textContent=msg;}
function taskStep(label,status='done'){if(!window._taskSteps)window._taskSteps=[];let item=window._taskSteps.find(x=>x.label===label);if(!item){item={label,status};window._taskSteps.push(item)}else item.status=status;const done=window._taskSteps.filter(x=>x.status==='done').length;const total=window._taskSteps.length||1;taskRender(Math.round(done/total*100));taskLog(`${status==='done'?'✓':status==='error'?'✗':'⏳'} ${label}`);}
function taskRender(percent=0){const bar=document.getElementById('taskBar');const pc=document.getElementById('taskPercent');const steps=document.getElementById('taskSteps');if(bar)bar.style.width=Math.max(0,Math.min(100,percent))+'%';if(pc)pc.textContent=Math.max(0,Math.min(100,percent))+'%';if(steps)steps.innerHTML=(window._taskSteps||[]).map(x=>`<div class="task-step ${x.status==='done'?'done':x.status==='error'?'error':x.status==='active'?'active':''}">${x.status==='done'?'✓':x.status==='error'?'✗':x.status==='active'?'⏳':'○'} ${escapeHtml(x.label)}</div>`).join('');}
function taskFinish(msg='Hoàn tất'){(window._taskSteps||[]).forEach(x=>{if(x.status==='todo'||x.status==='active')x.status='done'});taskRender(100);taskLog(msg);document.getElementById('taskSub').textContent=msg;}

async function loadSummary(){const data=await api('/learning/summary');const s=data.summary||{};const rows=[['Tài liệu chờ duyệt',s.todayTodo?.documents||0,'review'],['Cần xử lý',s.todayTodo?.needsAttention||0,'processing'],['Nhận diện yếu',s.todayTodo?.lowConfidence||0,'processing'],['Kinh nghiệm chờ áp dụng',s.todayTodo?.experiencesNeedReview||0,'experience'],['Knowledge đã duyệt',s.approvedKnowledge||0,'knowledge'],['Đã hấp thụ',s.absorption?.absorbed||0,'knowledge'],['Cần OCR/Parser',s.absorption?.needsExtraction||0,'knowledge']];document.getElementById('todayTodo').innerHTML=rows.map(([label,val,tab])=>`<div class="box" onclick="showTab('${tab}')"><div class="kpi">${val}</div><b>${label}</b><div class="muted">Bấm để xử lý</div></div>`).join('');document.getElementById('sideTodo').innerHTML=rows.map(([label,val,tab])=>`<div class="small-row" onclick="showTab('${tab}')"><span>${label}</span><b>${val}</b></div>`).join('');}

async function quickSyncConversations(){taskStart('Đồng bộ nhanh hội thoại mới',['Kết nối server','Sync Messenger','Sync Pancake','Tìm lại hội thoại']);try{taskStep('Kết nối server','active');const data=await api('/conversations/sync-quick',{method:'POST',body:JSON.stringify({limit:30,messages:30})});taskStep('Kết nối server','done');(data.steps||[]).forEach(st=>taskStep(st.label,st.ok?'done':'error'));taskStep('Tìm lại hội thoại','active');await searchConversations();taskStep('Tìm lại hội thoại','done');taskFinish(data.message||'Đồng bộ nhanh hoàn tất');}catch(e){taskStep('Đồng bộ nhanh','error');taskLog(e.message||String(e),'error')}}

async function searchConversations(){const q=document.getElementById('convQ').value.trim();const list=document.getElementById('conversationList');taskStart('Tìm hội thoại',['Kết nối dữ liệu','Tìm Supabase/cache','Render danh sách']);taskStep('Kết nối dữ liệu','active');list.innerHTML='<div class="empty-state">Đang tìm hội thoại...</div>';const data=await api(`/conversations/search?q=${encodeURIComponent(q)}&limit=30`);taskStep('Kết nối dữ liệu','done');taskStep('Tìm Supabase/cache',data.ok?'done':'error');const conversations=data.conversations||[];if(!conversations.length){list.innerHTML='<div class="empty-state">Không tìm thấy hội thoại. Có thể bấm “Đồng bộ mới” để lấy khách mới trong ngày.</div>';taskStep('Render danh sách','done');taskFinish('Không tìm thấy hội thoại');return}list.innerHTML=conversations.map((c,i)=>`<div class="conversation-result" id="convResult-${i}" onclick="selectConversation(${i})"><b>${escapeHtml(c.title)}</b><div class="muted">${escapeHtml(c.source)} • ${c.length||0} ký tự • ${escapeHtml(c.lastMessageAt||'')}</div><div class="mini">${escapeHtml((c.preview||'').slice(0,180))}${(c.preview||'').length>180?'...':''}</div></div>`).join('');window._conversationResults=conversations;selectConversation(0);taskStep('Render danh sách','done');taskFinish(`Tìm thấy ${conversations.length} hội thoại`);}

function providerKey(name=''){const p=String(name||'').toLowerCase();if(p.includes('openai'))return'openai';if(p.includes('gemini'))return'gemini';if(p.includes('deepseek'))return'deepseek';return p||'ai'}
function labelForProvider(key){return key==='openai'?'OpenAI':key==='gemini'?'Google Gemini':key==='deepseek'?'DeepSeek':'AI'}
function visibleResults(results=[]){return normalizeThreeProviders(results).filter(r=>providerVisibility[providerKey(r.provider)]!==false)}
function applyProviderGrid(containerId){const el=document.getElementById(containerId);if(!el)return;const count=el.querySelectorAll('.ai-card:not(.hidden-provider)').length||1;el.classList.remove('cols-1','cols-2','cols-3');el.classList.add('cols-'+Math.min(3,count));}
function toggleProviderCard(key){providerVisibility[key]=!providerVisibility[key];document.querySelectorAll(`.ai-card[data-provider="${key}"]`).forEach(x=>x.classList.toggle('hidden-provider',providerVisibility[key]===false));applyProviderGrid('conversationEval');applyProviderGrid('compareResults');}

function providerStatusBadge(r){if(r.ok)return `<span class="badge status-good">OK ${r.elapsedMs?Math.round(r.elapsedMs/100)/10+'s':''}</span>`;const code=r.errorCode||'';const txt=code==='balance'?'Hết quota':code==='timeout'?'Timeout':code==='missing_key'?'Thiếu key':code==='auth'?'Lỗi key':'Lỗi';return `<span class="badge status-bad">${txt}</span>`}
function renderAiReviewCard(r){const key=providerKey(r.provider);const label=labelForProvider(key);const hidden=providerVisibility[key]===false?' hidden-provider':'';if(!r.ok){return `<div class="ai-card${hidden}" data-provider="${key}"><h3><span class="ai-head-left"><span class="ai-logo ${key}">${label[0]}</span>${escapeHtml(label)}</span>${providerStatusBadge(r)}</h3><div class="provider-meta">Model: ${escapeHtml(r.model||'')} • Timeout: ${r.timeoutMs||'-'}ms</div><div class="review-section bad"><h4>🔴 Không đánh giá được</h4><p><b>${escapeHtml(r.userMessage||'Có lỗi khi gọi AI.')}</b></p><p class="muted">${escapeHtml(r.error||'Không có kết quả.')}</p></div><div class="card-actions"><button class="btn ghost" onclick="toggleProviderCard('${key}')">Ẩn/hiện</button></div></div>`}const score=extractScore(r.text,true);const parts=splitReview(r.text||'');const level=score>=8.2?'status-good':score>=7?'status-warn':'status-bad';const savePayload={provider:key,answer:r.text||'',score,question:(document.getElementById('comparePrompt')?.value||window._selectedConversation?.title||'')};return `<div class="ai-card${hidden}" data-provider="${key}"><h3><span class="ai-head-left"><span class="ai-logo ${key}">${label[0]}</span>${escapeHtml(label)}</span><span class="badge ${level}">${score>=8.2?'Tốt':score>=7?'Cần xem':'Yếu'}</span></h3><div class="provider-meta">${r.elapsedMs?`Phản hồi: ${Math.round(r.elapsedMs/100)/10}s`:''} ${r.timeoutMs?`• Timeout: ${r.timeoutMs}ms`:''}</div><div class="score">${score.toFixed(1)} <small>/10</small></div><div class="stars">${stars(score)}</div><div class="review-section good"><h4>🟢 Điểm mạnh</h4>${listHtml(parts.good,'Chưa nêu rõ điểm mạnh.')}</div><div class="review-section bad"><h4>🟠 Cần cải thiện</h4>${listHtml(parts.bad,'Chưa phát hiện lỗi lớn.')}</div><div class="review-section suggest"><h4>💡 Đề xuất</h4>${listHtml(parts.suggest,'Chưa có đề xuất cụ thể.')}</div><div class="card-actions"><button class="btn" onclick='addAiKnowledge(${JSON.stringify(savePayload)})'>➕ Thêm vào kiến thức AI</button><button class="btn ghost" onclick="prefillExperience(${JSON.stringify((r.text||'').slice(0,1200))})">Lưu kinh nghiệm</button><button class="btn ghost" onclick="toggleProviderCard('${key}')">Ẩn/hiện</button></div><details class="raw-toggle"><summary>Xem bản gốc</summary><pre>${escapeHtml(r.text||'')}</pre></details></div>`}

async function addAiKnowledge(payload){
  const topic=prompt('Nhóm/chủ đề kiến thức để lưu?', payload.question&&payload.question.toLowerCase().includes('bồn')?'Bồn tắm':'');
  if(topic===null)return;
  const body={...payload,topic,productGroup:topic,tags:['ai_compare','admin_approved']};
  try{
    const data=await api('/learning/knowledge/add',{method:'POST',body:JSON.stringify(body)});
    if(data.ok){alert('Đã thêm vào kiến thức AI và lưu Supabase. Lần sau AI Compare/bot sẽ ưu tiên dữ liệu này.');await loadSummary();await loadKnowledge();}
    else alert(data.error||'Không lưu được kiến thức');
  }catch(e){alert(e.message||String(e));}
}

async function checkPersistence(){
  const box=document.getElementById('persistenceBox');
  if(box)box.innerHTML='Đang kiểm tra Supabase...';
  const data=await api('/learning/persistence-check');
  if(!box)return;
  if(data.ok){
    const c=data.counts||{};
    box.innerHTML=`<div class="report ${data.safeToDeploy?'green':'orange'}"><b>${data.safeToDeploy?'✅ Deploy lại an toàn':'⚠️ Cần kiểm tra thêm'}</b><br>Supabase: ${data.supabaseReady?'đã bật':'chưa bật'} • Documents: ${c.documents||0} • Versions: ${c.versions||0} • Segments: ${c.segments||0} • Settings: ${c.settings||0}<br>Storage: ${escapeHtml(data.settingsStorage||'')}</div>`;
  } else box.innerHTML='<div class="report red">'+escapeHtml(data.error||'Không kiểm tra được')+'</div>';
}
function exportAiBrain(){ window.location.href='/api/ai-ops/learning/export'; }
function importAiBrainFile(file){
  if(!file)return;
  if(!confirm('Import kho AI Brain vào Supabase? Dữ liệu trùng ID sẽ được bỏ qua.'))return;
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      const data=await api('/learning/import',{method:'POST',body:JSON.stringify({dataUrl:reader.result})});
      if(data.ok){alert('Import xong.'); await loadKnowledge(); await loadSummary(); await checkPersistence();}
      else alert(data.error||JSON.stringify(data.result||data));
    }catch(e){alert(e.message||String(e));}
  };
  reader.readAsDataURL(file);
}

let lastConsensusText='';
function buildConsensusText(results){const texts=results.filter(r=>r.ok).map(r=>String(r.text||'').toLowerCase()).join('\n');const issues=[];if(texts.includes('hỏi lại'))issues.push('Bot có xu hướng hỏi lại điều đã biết.');if(texts.includes('báo giá')||texts.includes('giá'))issues.push('Cần xử lý câu hỏi giá rõ hơn, ưu tiên báo khoảng giá nếu có dữ liệu.');if(texts.includes('slide')||texts.includes('mẫu')||texts.includes('album'))issues.push('Cần kiểm tra việc gửi mẫu/slide khi khách yêu cầu xem.');if(texts.includes('sản phẩm'))issues.push('Cần củng cố Context Builder để nhận diện đúng sản phẩm trước khi trả lời.');if(texts.includes('sđt')||texts.includes('zalo'))issues.push('Cần kiểm tra trạng thái đã có SĐT/Zalo để không xin lại.');return (issues.length?issues:['Ba AI đã có đánh giá. Cần đọc chi tiết để rút kinh nghiệm cụ thể.']).join('\n');}
function renderConsensus(results, target='conversationConsensus'){lastConsensusText=buildConsensusText(results);const scores=results.filter(r=>r.ok).map(r=>extractScore(r.text,true)).filter(Boolean);const avg=scores.length?(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1):'-';return `<div class="consensus-card"><div style="width:100%"><h3>AI Consensus <span class="muted">(có thể sửa trước khi lưu)</span></h3><div class="score" style="color:#16a34a">${avg} <small>/10</small> <span class="stars">${avg!=='-'?stars(Number(avg)):''}</span></div><textarea id="${target}Text" class="consensus-editor">${escapeHtml(lastConsensusText)}</textarea><div class="row"><button class="btn" onclick="saveConsensusAsExperience('${target}')">⭐ Lưu thành kinh nghiệm</button><button class="btn ghost" onclick="restoreConsensus('${target}')">Khôi phục bản AI gốc</button></div></div></div>`}
function restoreConsensus(target){const el=document.getElementById(target+'Text');if(el)el.value=lastConsensusText;}
function saveConsensusAsExperience(target){const el=document.getElementById(target+'Text');prefillExperience(el?el.value:lastConsensusText);}

async function evaluateConversation(encodedId){const id=decodeURIComponent(encodedId);const box=document.getElementById('conversationEval');const consensus=document.getElementById('conversationConsensus');box.innerHTML='';consensus.innerHTML='';taskStart('Đánh giá hội thoại',['Load Timeline','Gửi OpenAI','Gửi Gemini','Gửi DeepSeek','Tạo AI Consensus']);taskStep('Load Timeline','active');const data=await api(`/conversations/${encodeURIComponent(id)}/evaluate`,{method:'POST',body:JSON.stringify({})});if(!data.ok){taskStep('Load Timeline','error');box.innerHTML='<div class="report red card" style="grid-column:1/-1">'+escapeHtml(data.error||'Lỗi')+'</div>';return}taskStep('Load Timeline','done');const results=normalizeThreeProviders(data.results||[]);for(const r of results){const key=providerKey(r.provider);taskStep(`Gửi ${labelForProvider(key)}`,r.ok?'done':'error')}box.innerHTML=results.map(renderAiReviewCard).join('');applyProviderGrid('conversationEval');taskStep('Tạo AI Consensus','done');consensus.innerHTML=renderConsensus(results,'conversationConsensus');taskFinish('Đánh giá hội thoại hoàn tất');}

async function compareModels(){const prompt=document.getElementById('comparePrompt').value;const box=document.getElementById('compareResults');const consensus=document.getElementById('compareConsensus');box.innerHTML='';consensus.innerHTML='';taskStart('AI Compare',['Gửi OpenAI','Gửi Gemini','Gửi DeepSeek','Tạo AI Consensus']);const data=await api('/compare',{method:'POST',body:JSON.stringify({prompt})});const results=normalizeThreeProviders(data.results||[]);for(const r of results){const key=providerKey(r.provider);taskStep(`Gửi ${labelForProvider(key)}`,r.ok?'done':'error')}box.innerHTML=results.map(renderAiReviewCard).join('');applyProviderGrid('compareResults');consensus.innerHTML=renderConsensus(results,'compareConsensus');taskStep('Tạo AI Consensus','done');taskFinish('AI Compare hoàn tất');}

async function runDiagnostics(auto=true){const out=document.getElementById('diagnosticsResult');if(!out)return;if(auto===false&&out.innerHTML.trim())return;out.innerHTML='<div class="empty-state">Đang kiểm tra AI...</div>';const provider=document.getElementById('diagProvider')?.value||'';const tests=[];if(document.getElementById('diagChat')?.checked)tests.push('chat');if(document.getElementById('diagCompare')?.checked)tests.push('compare');const data=await api('/diagnostics',{method:'POST',body:JSON.stringify({provider,tests:tests.length?tests:['chat']})});out.innerHTML=(data.results||[]).map(row=>{const hasError=(row.tests||[]).some(t=>!t.ok);const cls=!row.hasApiKey||hasError?'bad':'good';return `<div class="health-card ${cls}"><h3>${escapeHtml(row.label||row.provider)}</h3><div class="muted">Model: ${escapeHtml(row.model||'-')} • Mode: ${escapeHtml(row.mode||'-')}</div>${(row.tests||[]).map(t=>`<div class="role-row"><span>${escapeHtml(t.test||'test')}</span><span>${t.ok?'🟢 OK':'🔴 '+escapeHtml(t.userMessage||t.error||'Lỗi')}</span></div>`).join('')}</div>`}).join('')||'<div class="empty-state">Không có kết quả.</div>';}

const dz=document.getElementById('dropZone');if(dz){dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag')});dz.addEventListener('dragleave',()=>dz.classList.remove('drag'));dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag');document.getElementById('learningFiles').files=e.dataTransfer.files;});}
async function refreshAll(){
  // V7.0.19: trang Multi AI chỉ tải dữ liệu nhẹ bắt buộc.
  // Không tự gọi Learning/Reports ở tab ẩn vì nếu một API chậm sẽ làm người dùng tưởng AI Center đơ.
  const today=document.getElementById('todayTodo');
  const side=document.getElementById('sideTodo');
  if(today) today.innerHTML='<div class="muted">Đang tải thống kê...</div>';
  if(side) side.innerHTML='<div class="muted">Đang tải thống kê...</div>';
  await Promise.allSettled([
    safeLoad(loadSettings,'providers','Lỗi tải Multi AI'),
    safeLoad(loadSummary,'todayTodo','Lỗi tải thống kê')
  ]);
}
setTimeout(()=>{
  const today=document.getElementById('todayTodo');
  if(today && /Đang tải/.test(today.textContent||'')){
    today.innerHTML='<div class="card report orange" style="padding:12px"><b>AI Center chưa nhận được phản hồi sau 10 giây</b><br><span class="muted">Có thể backend/Supabase đang chậm. Các tab vẫn bấm được; hãy mở AI Diagnostics hoặc bấm Làm mới.</span></div>';
  }
},10000);
refreshAll();
