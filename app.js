const $ = (id) => document.getElementById(id);
let currentData = null;
let companyLogo = 'logo.png';
const statusEl = $('status');
function setStatus(msg){ statusEl.textContent = msg; }

const demoText = `Product Name: PETRÓLEO DIESEL B5\nIntended use: Combustible diesel B5.\nNFPA Hazard ID: Health: 0 Flammability: 2 Reactivity: 0 Special: COR\nCAS: 68476-34-6\nPELIGRO. GHS02 llama. GHS07 exclamación. GHS08 peligro salud. GHS09 ambiente.\nCausa irritación respiratoria. Puede ser mortal en caso de ingestión y penetración en vías respiratorias. Evitar fuentes de ignición. Usar guantes, lentes, ropa de protección y botas.`;

$('logoFile').onchange = async () => {
  const f = $('logoFile').files[0];
  if(!f) return;
  companyLogo = await toBase64(f);
  $('headerLogo').src = companyLogo;
  if(currentData) renderPoster(currentData);
  setStatus('Logo cargado. Se usará en el rótulo y en las descargas.');
};
$('demoBtn').onclick = () => { $('manualText').value = demoText; renderPoster(analyzeText(demoText)); setStatus('Ejemplo generado.'); };
$('manualBtn').onclick = () => { renderPoster(analyzeText($('manualText').value)); setStatus('Rótulo generado desde texto manual.'); };
$('analyzeBtn').onclick = analyzePdf;
$('pngBtn').onclick = downloadPng;
$('pdfBtn').onclick = downloadPdf;
$('jsonBtn').onclick = downloadJson;

async function analyzePdf(){
  const file = $('pdfFile').files[0];
  const gasUrl = $('gasUrl').value.trim();
  if(!file) return setStatus('Selecciona una SDS/FDS en PDF.');
  if(!gasUrl) return setStatus('Pega primero la URL del Web App de Google Apps Script.');
  setStatus('Enviando PDF a Apps Script. Extrayendo texto y analizando SDS/FDS...');
  const base64 = await toBase64(file);
  const payload = { filename:file.name, mimeType:file.type, base64:base64.split(',')[1] };
  try{
    const res = await fetch(gasUrl, { method:'POST', body: JSON.stringify(payload) });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const json = await res.json();
    if(json.error) throw new Error(json.error);
    const rotulo = normalizeData(json.rotulo || analyzeText(json.text || ''));
    renderPoster(rotulo);
    setStatus((json.mode==='ai'?'Análisis IA completado. ':'Análisis por reglas completado. ') + 'Revisar técnicamente antes de imprimir.');
  }catch(err){
    setStatus('Error al analizar con Apps Script: '+err.message+'. Puedes pegar el texto manualmente.');
  }
}
function toBase64(file){ return new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); }); }
function normalizeData(d){
  d = d || {};
  d.product = d.product || d.nombreProducto || 'PRODUCTO QUÍMICO';
  d.use = d.use || d.uso || 'Uso indicado según SDS/FDS.';
  d.nfpa = d.nfpa || {h:1,f:1,r:0,s:'—'};
  d.ghs = d.ghs || [];
  d.noGhs = !!d.noGhs || d.ghs.length===0;
  d.signal = d.signal || (d.noGhs?'NO CLASIFICADO':'ATENCIÓN');
  d.epp = d.epp || [['🥽','Gafas de seguridad'],['🧤','Guantes de protección'],['🥼','Ropa de trabajo']];
  d.risks = d.risks || ['Manipular conforme a buenas prácticas de higiene industrial.'];
  d.environment = d.environment || 'Evitar derrames al suelo, desagües y cuerpos de agua.';
  d.firstAid = d.firstAid || {inhalacion:'Trasladar al aire fresco.',piel:'Lavar con agua y jabón.',ojos:'Enjuagar con abundante agua.',ingestion:'Enjuagar la boca. No inducir el vómito.'};
  d.storage = d.storage || ['Almacenar en envase original bien cerrado.','Mantener en lugar fresco, seco y ventilado.','Mantener alejado de materiales incompatibles.','Lavarse las manos después del uso.'];
  d.footer = d.footer || 'NO REGULADO COMO MERCANCÍA PELIGROSA PARA TRANSPORTE TERRESTRE, MARÍTIMO Y AÉREO';
  return d;
}

function analyzeText(text){
  const t = (text||'').replace(/\s+/g,' ');
  const up = t.toUpperCase();
  const product = extract(t, /(?:Product Name|Nombre comercial|Nombre del Producto|Producto)\s*[:：]?\s*([^\n\.]{3,90})/i) || extract(t, /(Shell\s+Omala\s+S2\s+GX\s+\d+|Shell\s+Tellus\s+S2\s+MX\s+\d+|CAT\s+DEO\s+15W-40|WR\s*89\s*NewGeneration|Petr[oó]leo\s+Diesel\s+B5)/i) || 'PRODUCTO QUÍMICO';
  const use = /HYDRAULIC|HIDR[ÁA]ULICO|ACEITE HIDR/.test(up) ? 'Aceite hidráulico.' : /GEAR|ENGRANAJE|OMALA/.test(up) ? 'Lubricante de engranajes.' : /ENGINE OIL|MOTOR|DEO/.test(up) ? 'Aceite lubricante para motores diésel.' : /WR\s*89|MECANIZADO|REFRIGERANTE|COOLANT/.test(up) ? 'Lubricante refrigerante para operaciones de mecanizado y rectificado de metales.' : /DIESEL B5|PETR[ÓO]LEO/.test(up) ? 'Combustible diésel B5.' : 'Uso indicado según SDS/FDS.';
  let nfpa = {h:1,f:1,r:0,s:'—'};
  const nf = up.match(/NFPA[^\n]{0,160}HEALTH\s*:?\s*(\d)[^\n]{0,80}FLAMMABILITY\s*:?\s*(\d)[^\n]{0,80}REACTIVITY\s*:?\s*(\d)/);
  if(nf) nfpa = {h:+nf[1],f:+nf[2],r:+nf[3],s:'—'};
  if(/COR|CORROSIVO/.test(up)) nfpa.s='COR';
  const flash = parseFloat((up.match(/FLASH POINT[^0-9>]*(?:>|&GT;)?\s*(\d+)/)||[])[1]||'0');
  if(flash>200 && nfpa.f<1) nfpa.f=1;
  const ghs=[];
  if(/GHS02|FLAMMABLE|INFLAMABLE|IGNITION|FUENTES DE IGNICI[ÓO]N/.test(up)) ghs.push(['🔥','GHS02','INFLAMABLE']);
  if(/GHS05|CORROS/.test(up)) ghs.push(['🧪','GHS05','CORROSIVO']);
  if(/GHS07|IRRIT|TOXICIDAD AGUDA|EXCLAM/.test(up)) ghs.push(['!','GHS07','IRRITANTE']);
  if(/GHS08|ASPIRATION|H304|CARCIN|MUTAG|REPRO/.test(up)) ghs.push(['♟','GHS08','PELIGRO SALUD']);
  if(/GHS09|AQUATIC|H400|H410|H411|AMBIENTE ACU[ÁA]TICO/.test(up)) ghs.push(['🌳','GHS09','AMBIENTE']);
  const noGhs = /(NO SE REQUIERE NING[ÚU]N S[ÍI]MBOLO|NO CLASIFICADO|NOT CLASSIFIED|NO CUMPLE CON LOS CRITERIOS|NOT HAZARDOUS)/.test(up) && !ghs.length;
  const epp=[];
  if(/EYE|OJOS|GAFAS|EN166|GOGGLES/.test(up)) epp.push(['🥽','Gafas de seguridad']);
  if(/GLOVE|GUANTES|NITRILE|NITRILO|PVC|NEOPRENO/.test(up)) epp.push(['🧤','Guantes de protección']);
  if(/WORK CLOTHING|ROPA|LONG SLEEVED|MANGA LARGA|BODY/.test(up)) epp.push(['🥼','Ropa de trabajo']);
  if(/BOOT|CALZADO|BOTAS/.test(up)) epp.push(['🥾','Botas de seguridad']);
  if(/RESPIRATORY|RESPIRATOR|RESPIRATORIA|VENTILACI[ÓO]N INSUFICIENTE|NEBLINA|MIST/.test(up)) epp.push(['😷','Protección respiratoria*']);
  if(!epp.length) epp.push(['🥽','Gafas de seguridad'],['🧤','Guantes de protección'],['🥼','Ropa de trabajo']);
  const risks=[];
  if(/INJECTION|INYECCI[ÓO]N/.test(up)) risks.push('La inyección a alta presión bajo la piel puede causar daño grave.');
  if(/ALLERGIC|AL[ÉE]RGICA|SENS/.test(up)) risks.push('Puede provocar reacción alérgica en personas sensibilizadas.');
  if(/IRRIT|OJO|EYE/.test(up)) risks.push('Puede causar irritación leve en ojos, piel o vías respiratorias.');
  if(/USED OIL|ACEITE USADO/.test(up)) risks.push('El aceite usado puede contener impurezas nocivas.');
  if(/NOT CLASSIFIED AS FLAMMABLE|NO EST[ÁA] CLASIFICADO COMO INFLAMABLE|PUEDE ARDER/.test(up)) risks.push('No está clasificado como inflamable, pero puede arder si se calienta.');
  if(/DIESEL B5|PETR[ÓO]LEO/.test(up)) risks.push('Mantener alejado de calor, chispas, llamas y fuentes de ignición.');
  if(!risks.length) risks.push('Manipular conforme a buenas prácticas de higiene industrial.','Evitar contacto prolongado o repetido con la piel.');
  return normalizeData({product:product.trim(),use,nfpa,ghs,noGhs,signal:/PELIGRO|DANGER/.test(up)?'PELIGRO':(noGhs?'NO CLASIFICADO':'ATENCIÓN'),epp,risks,environment:/(NOT CLASSIFIED AS AN ENVIRONMENTAL HAZARD|NO SE CLASIFICA COMO.*MEDIO AMBIENTE|NO SIGNIFICANT.*ENVIRONMENTAL)/.test(up)?'No se clasifica como peligroso para el medio ambiente.':'Evitar derrames al suelo, desagües y cuerpos de agua.'});
}
function extract(text, re){ const m=text.match(re); return m ? (m[1]||'') : ''; }

function renderPoster(data){
  const d=normalizeData(data); currentData=d;
  $('pngBtn').disabled=false; $('pdfBtn').disabled=false; $('jsonBtn').disabled=false;
  const p=$('poster');
  const diesel = /DIESEL|PETR[ÓO]LEO/i.test(d.product);
  p.className = diesel ? 'poster a3 greenTitle' : 'poster a3';
  const ghsHtml = d.ghs?.length ? `<div class="ghsPictos">${d.ghs.map(x=>`<div><div class="diamond"><span>${x[0]}</span></div><div class="smallLabel">${x[1]}<br>${x[2]}</div></div>`).join('')}</div>` : `<div class="ghsBox"><h3>NO CLASIFICADO<br>SGA / GHS</h3><p>En función de los datos disponibles, esta sustancia/mezcla no cumple con los criterios de clasificación.</p><b>Sin pictogramas GHS.</b><p>Sin palabra de advertencia.</p></div>`;
  p.innerHTML = `<div class="posterGrid">
    <div class="headerBand">SUSTANCIA QUÍMICA</div><img class="brand" src="${companyLogo}"/>
    <div class="cell nfpaCell"><div class="nfpaTitle">NFPA 704</div><div class="nfpaWrap"><div class="nfpa"><div class="red"><span>${d.nfpa.f}</span></div><div class="blue"><span>${d.nfpa.h}</span></div><div class="yellow"><span>${d.nfpa.r}</span></div><div class="white"><span>${d.nfpa.s}</span></div></div><div class="legend"><b class="az">AZUL - SALUD</b>${d.nfpa.h} = ${d.nfpa.h===0?'Riesgo mínimo':'Riesgo leve'}<b class="ro">ROJO - INFLAMABILIDAD</b>${d.nfpa.f} = ${d.nfpa.f===0?'No combustible bajo condiciones normales':'Combustible si se calienta'}<b class="am">AMARILLO - REACTIVIDAD</b>${d.nfpa.r} = Estable.<b>BLANCO - ESPECIAL</b>${d.nfpa.s} = ${d.nfpa.s==='—'?'Ninguno':'Especial'}</div></div></div>
    <div class="cell productCell"><div class="productName">${esc(d.product)}</div><div class="pill">${esc((d.use||'Uso indicado').replace(/\.$/,'')).toUpperCase()}</div><div class="useTitle">USO:</div><div class="useText">${esc(d.use)}</div></div>
    <div class="cell ghsCell">${ghsHtml}</div>
    <div class="cell epp"><div class="sectionTitle">EPP RECOMENDADO</div><div class="icons">${d.epp.slice(0,5).map(x=>`<div class="ico"><div class="circle">${x[0]}</div>${esc(x[1])}</div>`).join('')}</div><div class="note">*Usar protección respiratoria cuando exista ventilación insuficiente o se generen nieblas / aerosoles.</div></div>
    <div class="cell risks"><div class="sectionTitle">RIESGOS PRINCIPALES</div><ul>${d.risks.map(r=>`<li><span class="warn">⚠</span>${esc(r)}</li>`).join('')}</ul></div>
    <div class="cell env"><div class="sectionTitle">MEDIO AMBIENTE</div><div class="leaf">☘</div><p>${esc(d.environment)}</p><hr><b>Evitar derrames al suelo,<br>desagües y cuerpos de agua.</b></div>
    <div class="cell first"><div class="sectionTitle">PRIMEROS AUXILIOS</div>${aid('🫁','Inhalación',d.firstAid.inhalacion)}${aid('✋','Piel',d.firstAid.piel)}${aid('👁','Ojos',d.firstAid.ojos)}${aid('👤','Ingestión',d.firstAid.ingestion)}</div>
    <div class="cell storage"><div class="sectionTitle">ALMACENAMIENTO Y MANEJO</div>${d.storage.map((s,i)=>`<div class="row"><div class="mini">${['🧰','🌡','🏠','🧼'][i]||'•'}</div><div>${esc(s)}</div></div>`).join('')}</div>
    <div class="cell disposal"><div class="trash">🗑</div><div>Eliminar el contenido/recipiente de acuerdo con la normativa local y nacional vigente.<br><br>No verter al suelo, desagües ni cuerpos de agua.</div></div>
    <div class="footer">${esc(d.footer)}</div></div>`;
}
function aid(icon,title,text){ return `<div class="row"><div class="mini">${icon}</div><div><b>${title}:</b> ${esc(text)}</div></div>`; }
function esc(s){return String(s||'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
async function downloadPng(){ const canvas=await html2canvas($('poster'),{scale:2,backgroundColor:'#fff',useCORS:true}); const a=document.createElement('a'); a.download=safeName()+'.png'; a.href=canvas.toDataURL('image/png'); a.click(); }
async function downloadPdf(){ const canvas=await html2canvas($('poster'),{scale:2,backgroundColor:'#fff',useCORS:true}); const img=canvas.toDataURL('image/png'); const {jsPDF}=window.jspdf; const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a3'}); pdf.addImage(img,'PNG',0,0,420,297); pdf.save(safeName()+'.pdf'); }
function downloadJson(){ const blob=new Blob([JSON.stringify(currentData,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.download=safeName()+'.json'; a.href=URL.createObjectURL(blob); a.click(); URL.revokeObjectURL(a.href); }
function safeName(){return (currentData?.product||'rotulo_matpel').replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'');}
