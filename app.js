pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const $=id=>document.getElementById(id);
let logoDataUrl="logo.png";

const GHS_SYMBOLS={
  GHS01:["💥","EXPLOSIVO"], GHS02:["🔥","INFLAMABLE"], GHS03:["⭕","COMBURENTE"],
  GHS04:["🧯","GAS A PRESIÓN"], GHS05:["🧪","CORROSIVO"], GHS06:["☠️","TOXICIDAD AGUDA"],
  GHS07:["!","IRRITANTE"], GHS08:["👤","PELIGRO SALUD"], GHS09:["🌳","AMBIENTE"]
};

function lines(txt){return txt.split(/\n+/).map(s=>s.trim()).filter(Boolean);}
function setStatus(msg){$("status").textContent=msg;}

$("logoInput").addEventListener("change", async e=>{
  const f=e.target.files[0]; if(!f) return;
  logoDataUrl=await fileToDataUrl(f);
  $("headerLogo").src=logoDataUrl; $("posterLogo").src=logoDataUrl;
});

function fileToDataUrl(file){
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});
}

async function extractPdfText(file){
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  let text="";
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i);
    const content=await page.getTextContent();
    text += "\n\n--- PÁGINA "+i+" ---\n" + content.items.map(it=>it.str).join(" ");
  }
  return text;
}

$("extractBtn").onclick=async()=>{
  const f=$("pdfInput").files[0];
  if(!f){setStatus("Selecciona un PDF SDS/FDS.");return;}
  setStatus("Extrayendo texto del PDF...");
  try{
    const text=await extractPdfText(f);
    $("sdsText").value=text;
    setStatus("Texto extraído correctamente. Puedes analizar con IA o modo básico.");
  }catch(e){setStatus("No se pudo leer el PDF. Revisa que no esté escaneado como imagen.");}
};

$("basicBtn").onclick=()=>{
  const text=$("sdsText").value || "";
  const data=basicAnalyze(text);
  fillForm(data); renderPoster();
  setStatus("Análisis básico aplicado. Revisa y ajusta manualmente antes de imprimir.");
};

$("aiBtn").onclick=async()=>{
  const key=$("apiKey").value.trim();
  if(!key){setStatus("Coloca tu API Key de OpenAI o usa modo básico.");return;}
  let text=$("sdsText").value;
  if(!text && $("pdfInput").files[0]){
    setStatus("Extrayendo texto antes de analizar con IA...");
    text=await extractPdfText($("pdfInput").files[0]);
    $("sdsText").value=text;
  }
  if(!text){setStatus("Primero carga y extrae una SDS/FDS.");return;}
  setStatus("Analizando SDS con IA. El costo de tokens corresponde a la API Key ingresada.");
  try{
    const data=await analyzeWithOpenAI(key,text.slice(0,55000));
    fillForm(data); renderPoster();
    setStatus("Análisis IA completado. Revisa el resultado técnico antes de usar en campo.");
  }catch(e){
    console.error(e);
    setStatus("Error al analizar con IA. Verifica API Key, saldo o conexión.");
  }
};

async function analyzeWithOpenAI(apiKey,sdsText){
  const prompt = `Actúa como especialista MATPEL, NFPA 704 y SGA/GHS. Analiza la SDS/FDS y responde SOLO JSON válido.
Usa estrictamente la SDS. Si NFPA no aparece, propón valores técnicos basados en salud, punto de inflamación y reactividad, indicando en riskNotes que es propuesto.
No inventes pictogramas GHS si la SDS dice que no requiere.
JSON:
{
 "productName":"","productUse":"","casNumber":"","signalWord":"","ghsPictograms":["GHS02"],
 "nfpa":{"health":0,"fire":1,"reactivity":0,"special":"-"},
 "ppe":[""],
 "risks":[""],
 "firstAid":[""],
 "storage":[""],
 "environment":"",
 "disposal":"",
 "transportFooter":""
}
SDS:
${sdsText}`;
  const res=await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},
    body:JSON.stringify({
      model:"gpt-4o-mini",
      temperature:0.1,
      messages:[{role:"user",content:prompt}]
    })
  });
  if(!res.ok) throw new Error(await res.text());
  const out=await res.json();
  let content=out.choices[0].message.content.trim();
  content=content.replace(/^```json/i,"").replace(/^```/,"").replace(/```$/,"").trim();
  return JSON.parse(content);
}

function basicAnalyze(text){
  const lower=text.toLowerCase();
  let product=(text.match(/(?:Product Name|Nombre comercial|Trade name|Producto)\s*:?\s*([A-Z0-9][^\n\r]{3,80})/i)||[])[1]||"PRODUCTO QUÍMICO";
  product=product.replace(/Revision Date.*$/i,"").trim();
  let use=(text.match(/(?:Uso de la sustancia\/mezcla|Intended Use|Identified uses|Usos identificados)\s*:?\s*([^\n\r]{3,80})/i)||[])[1]||"Uso según SDS";
  let cas=(text.match(/CAS[#\s:]*([0-9]{2,7}-[0-9]{2}-[0-9])/i)||[])[1]||"No indicado";

  const noGhs = /no se requiere ningún símbolo|sin palabra de advertencia|not classified as hazardous|no cumple con los criterios/i.test(text);
  const pict=[];
  if(/flammable|inflamable|highly flammable|líquido inflamable/i.test(text)) pict.push("GHS02");
  if(/corros/i.test(text)) pict.push("GHS05");
  if(/toxicidad aguda|acute toxicity|irrit/i.test(text) && !noGhs) pict.push("GHS07");
  if(/carcin|mutagen|repro|aspiration|órganos|organ/i.test(text) && !noGhs) pict.push("GHS08");
  if(/aquatic|acuático|environmental hazard|peligroso para el medio ambiente/i.test(text) && !noGhs) pict.push("GHS09");

  let flash=(text.match(/(?:Flash Point|Punto de inflamación)[^\d>]*(>?)(\d{2,3})/i)||[]);
  let fire=1;
  if(flash[2]){const fp=parseInt(flash[2]); fire = fp<93 ? 2 : 1;}
  if(/not flammable|no está clasificado como inflamable/i.test(text)) fire=1;

  let health=/high-pressure injection|inyección a alta presión|lesión ocular grave|serious eye damage/i.test(text)?1:1;
  if(/not hazardous|no clasificado/i.test(text) && !/irrit|injection|inyección/i.test(text)) health=0;

  return {
    productName: product.toUpperCase(),
    productUse: use,
    casNumber: cas,
    signalWord: noGhs ? "No aplica" : (lower.includes("danger")||lower.includes("peligro")?"PELIGRO":"ATENCIÓN"),
    ghsPictograms:[...new Set(pict)],
    nfpa:{health, fire, reactivity:0, special:"-"},
    ppe:["Gafas de seguridad","Guantes de protección","Ropa de trabajo","Protección respiratoria si hay ventilación insuficiente"],
    risks:["Revisar SDS completa antes de uso en campo.","Puede causar irritación por exposición prolongada.","No mezclar con materiales incompatibles."],
    firstAid:["Ojos: Enjuagar con agua.","Piel: Lavar con agua y jabón.","Inhalación: Trasladar al aire fresco.","Ingestión: No inducir el vómito y buscar atención médica si hay síntomas."],
    storage:["Almacenar en envase original cerrado.","Mantener en lugar fresco, seco y ventilado.","Mantener alejado de materiales incompatibles.","Lavarse las manos después del uso."],
    environment:"Evitar derrames al suelo, desagües y cuerpos de agua.",
    disposal:"Eliminar el contenido/recipiente según normativa local y nacional vigente.",
    transportFooter:/not regulated|no está clasificado como producto peligroso|no regulado/i.test(text) ? "NO REGULADO COMO MERCANCÍA PELIGROSA PARA TRANSPORTE TERRESTRE, MARÍTIMO Y AÉREO" : "VERIFICAR CLASIFICACIÓN DE TRANSPORTE SEGÚN SDS"
  };
}

function fillForm(d){
  $("productName").value=d.productName||"PRODUCTO QUÍMICO";
  $("productUse").value=d.productUse||"Uso según SDS";
  $("casNumber").value=d.casNumber||"No indicado";
  $("signalWord").value=d.signalWord||"No aplica";
  $("nfpaHealth").value=d.nfpa?.health ?? 1;
  $("nfpaFire").value=d.nfpa?.fire ?? 1;
  $("nfpaReact").value=d.nfpa?.reactivity ?? 0;
  $("nfpaSpecial").value=d.nfpa?.special ?? "-";
  [...$("ghsSelect").options].forEach(o=>o.selected=(d.ghsPictograms||[]).includes(o.value));
  $("ppeText").value=(d.ppe||[]).join("\n");
  $("riskText").value=(d.risks||[]).join("\n");
  $("firstAidText").value=(d.firstAid||[]).join("\n");
  $("storageText").value=(d.storage||[]).join("\n");
  $("envText").value=d.environment||"";
  $("disposalText").value=d.disposal||"";
  document.querySelector(".footer").textContent=d.transportFooter||"NO REGULADO COMO MERCANCÍA PELIGROSA PARA TRANSPORTE TERRESTRE, MARÍTIMO Y AÉREO";
}

$("renderBtn").onclick=renderPoster;

function renderPoster(){
  $("posterLogo").src=logoDataUrl;
  $("productNameOut").textContent=$("productName").value;
  $("productUseOut").textContent=$("productUse").value;
  $("casOut").textContent=$("casNumber").value;
  $("nfpaHealthOut").textContent=$("nfpaHealth").value;
  $("nfpaFireOut").textContent=$("nfpaFire").value;
  $("nfpaReactOut").textContent=$("nfpaReact").value;
  $("nfpaSpecialOut").textContent=$("nfpaSpecial").value || "-";
  $("healthLegend").textContent=`${$("nfpaHealth").value} = ${$("nfpaHealth").value==0?"Riesgo mínimo":"Riesgo leve/moderado según SDS"}.`;
  $("fireLegend").textContent=`${$("nfpaFire").value} = ${$("nfpaFire").value==0?"No arde en condiciones normales":"Combustible si se calienta"}.`;

  const selected=[...$("ghsSelect").selectedOptions].map(o=>o.value);
  $("signalWordOut").innerHTML = selected.length ? (($("signalWord").value||"ATENCIÓN")+"<br>SGA / GHS") : "NO CLASIFICADO<br>SGA / GHS";
  $("ghsClassOut").textContent = selected.length ? "Pictogramas aplicables según SDS/FDS." : "Sin pictogramas GHS. Sin palabra de advertencia.";
  $("ghsIcons").innerHTML = selected.map(code=>{
    const [sym,label]=GHS_SYMBOLS[code];
    return `<div><div class="ghs"><span>${sym}</span></div><div class="ghsLabel">${code}<br>${label}</div></div>`;
  }).join("");

  $("ppeOut").innerHTML=lines($("ppeText").value).slice(0,8).map(item=>`<div><div class="eppIcon">${iconFor(item)}</div><div>${item}</div></div>`).join("");
  $("riskOut").innerHTML=lines($("riskText").value).map(x=>`<li>${x}</li>`).join("");
  $("firstAidOut").innerHTML=lines($("firstAidText").value).map(x=>`<li>${x}</li>`).join("");
  $("storageOut").innerHTML=lines($("storageText").value).map(x=>`<li>${x}</li>`).join("");
  $("envOut").textContent=$("envText").value;
  $("disposalOut").textContent=$("disposalText").value;
}
function iconFor(t){
  t=t.toLowerCase();
  if(t.includes("gafa")||t.includes("lente")||t.includes("ojo")) return "🥽";
  if(t.includes("guante")) return "🧤";
  if(t.includes("resp")) return "😷";
  if(t.includes("bota")||t.includes("calzado")) return "🥾";
  if(t.includes("ropa")||t.includes("manga")) return "🥼";
  if(t.includes("audit")) return "🎧";
  return "🛡️";
}

async function posterCanvas(){
  const el=$("poster");
  return await html2canvas(el,{scale:2,useCORS:true,backgroundColor:"#ffffff"});
}
$("pngBtn").onclick=async()=>{
  renderPoster();
  const canvas=await posterCanvas();
  const a=document.createElement("a");
  a.download=($("productName").value||"rotulo").replace(/[^a-z0-9]+/gi,"_")+"_A3_horizontal.png";
  a.href=canvas.toDataURL("image/png");
  a.click();
};
$("pdfBtn").onclick=async()=>{
  renderPoster();
  const canvas=await posterCanvas();
  const img=canvas.toDataURL("image/png");
  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a3"});
  pdf.addImage(img,"PNG",5,5,410,287);
  pdf.save(($("productName").value||"rotulo").replace(/[^a-z0-9]+/gi,"_")+"_A3_horizontal.pdf");
};

renderPoster();
