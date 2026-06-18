pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const $=id=>document.getElementById(id);
let logoUrl="logo.png";
const GHS={
 GHS01:["💥","PELIGRO DE EXPLOSIVOS"],GHS02:["🔥","INFLAMABLE"],GHS03:["⭕","CARBURANTE"],
 GHS04:["▰","GASES BAJO PRESIÓN"],GHS05:["🧪","CORROSIÓN"],GHS06:["☠","TOXICIDAD"],
 GHS07:["!","QUÍMICO NOCIVO"],GHS08:["♟","PELIGRO PARA LA SALUD"],GHS09:["🌳","DAÑO AL MEDIO AMBIENTE"]
};
const defaults={
 productName:"PRODUCTO QUÍMICO",productUse:"Uso según SDS",casNumber:"No indicado",signalWord:"ATENCIÓN",
 nfpa:{health:1,fire:1,reactivity:0,special:"-"}, ghsPictograms:[],
 ppe:["Gafas de seguridad","Guantes de protección","Ropa de trabajo","Protección respiratoria si hay ventilación insuficiente"],
 risks:["Revisar SDS completa antes de uso en campo.","Puede causar irritación por exposición prolongada.","No mezclar con materiales incompatibles."],
 firstAid:["Ojos: Enjuagar con agua.","Piel: Lavar con agua y jabón.","Inhalación: Trasladar al aire fresco.","Ingestión: No inducir el vómito y buscar atención médica si hay síntomas."],
 storage:["Almacenar en envase original cerrado.","Mantener en lugar fresco, seco y ventilado.","Mantener alejado de materiales incompatibles.","Lavarse las manos después del uso."],
 environment:"Evitar derrames al suelo, desagües y cuerpos de agua.",
 disposal:"Eliminar el contenido/recipiente según normativa local y nacional vigente.",
 transportFooter:"VERIFICAR CLASIFICACIÓN DE TRANSPORTE SEGÚN SDS"
};
function status(t){$("status").textContent=t}
function splitLines(t){return t.split(/\n+/).map(x=>x.trim()).filter(Boolean)}
function fileUrl(f){return new Promise((res,rej)=>{let r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)})}

$("logoInput").onchange=async e=>{let f=e.target.files[0]; if(!f)return; logoUrl=await fileUrl(f); $("brandLogo").src=logoUrl; $("posterLogo").src=logoUrl; render();};
$("pdfInput").onchange=async()=>{await extractPdf();};

async function extractPdf(){
 let f=$("pdfInput").files[0]; if(!f){status("Selecciona un PDF.");return ""}
 status("Extrayendo texto del PDF...");
 try{
  const data=await f.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data}).promise;
  let text="";
  for(let p=1;p<=pdf.numPages;p++){
    const page=await pdf.getPage(p);
    const c=await page.getTextContent();
    text += "\n--- PAGINA "+p+" ---\n"+c.items.map(i=>i.str).join(" ");
  }
  $("sdsText").value=text;
  status("Texto extraído. Ahora presiona Modo básico o Analizar con IA.");
  return text;
 }catch(e){console.error(e);status("No se pudo extraer texto. Puede ser PDF escaneado.");return ""}
}
$("extractBtn").onclick=extractPdf;
$("basicBtn").onclick=async()=>{let t=$("sdsText").value || await extractPdf(); fill(basic(t)); render(); status("Modo básico aplicado. Revisa antes de imprimir.");};

$("aiBtn").onclick=async()=>{
 const key=$("apiKey").value.trim(); if(!key){status("Coloca la API Key del usuario.");return}
 let t=$("sdsText").value || await extractPdf(); if(!t)return;
 status("Analizando con IA...");
 try{ const d=await aiAnalyze(key,t.slice(0,55000)); fill(d); render(); status("Análisis IA completado. Revisión técnica obligatoria antes de campo.");}
 catch(e){console.error(e); status("Error IA: revisa API Key, saldo o conexión. Usa modo básico mientras tanto.")}
};
async function aiAnalyze(key,text){
 const prompt=`Eres especialista MATPEL, NFPA 704 y SGA/GHS. Analiza estrictamente la SDS y devuelve SOLO JSON válido:
{"productName":"","productUse":"","casNumber":"","signalWord":"","ghsPictograms":["GHS02"],"nfpa":{"health":0,"fire":1,"reactivity":0,"special":"-"},"ppe":[""],"risks":[""],"firstAid":[""],"storage":[""],"environment":"","disposal":"","transportFooter":""}
Reglas: Si SDS dice sin pictogramas GHS, no agregues pictogramas. Si no hay NFPA, propón técnicamente y usa propiedades de salud, flash point e inestabilidad. EPP solo según SDS.
SDS:${text}`;
 const res=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},body:JSON.stringify({model:"gpt-4o-mini",temperature:0.1,messages:[{role:"user",content:prompt}]})});
 if(!res.ok)throw new Error(await res.text());
 let out=await res.json(); let c=out.choices[0].message.content.trim().replace(/^```json/i,"").replace(/^```/,"").replace(/```$/,"").trim();
 return JSON.parse(c);
}
function basic(text){
 const d=JSON.parse(JSON.stringify(defaults)); if(!text)return d;
 const L=text.toLowerCase();
 let m=text.match(/(?:Product Name|Nombre comercial|Trade name|Producto)\s*:?\s*([A-Z0-9][^\n\r]{3,80})/i);
 if(m)d.productName=m[1].replace(/Revision Date.*$/i,"").trim().toUpperCase();
 m=text.match(/(?:Intended Use|Uso de la sustancia\/mezcla|Usos identificados|Identified uses)\s*:?\s*([^\n\r]{3,90})/i);
 if(m)d.productUse=m[1].trim();
 m=text.match(/(?:CAS#?|Número CAS|CAS)\s*:?\s*([0-9]{2,7}-[0-9]{2}-[0-9])/i);
 if(m)d.casNumber=m[1];
 let noGhs=/no se requiere ningún símbolo|sin palabra de advertencia|not classified as hazardous|no cumple con los criterios|not hazardous according/i.test(text);
 d.signalWord=noGhs?"No aplica":(/danger|peligro/i.test(text)?"PELIGRO":"ATENCIÓN");
 let pics=[];
 if(!noGhs || /pictogram|ghs/i.test(text)){
   if(/ghs01|explos/i.test(text))pics.push("GHS01");
   if(/ghs02|flammable|inflamable/i.test(text))pics.push("GHS02");
   if(/ghs03|oxid|comburente/i.test(text))pics.push("GHS03");
   if(/ghs04|gas bajo presión|gas under pressure/i.test(text))pics.push("GHS04");
   if(/ghs05|corros/i.test(text))pics.push("GHS05");
   if(/ghs06|toxicidad aguda|acute toxicity|fatal if/i.test(text))pics.push("GHS06");
   if(/ghs07|irrit|nocivo|harmful|skin irrit|eye irrit/i.test(text))pics.push("GHS07");
   if(/ghs08|carcin|mutagen|repro|aspiration|órgano|organ/i.test(text))pics.push("GHS08");
   if(/ghs09|aquatic|acuático|environmental hazard|medio ambiente/i.test(text))pics.push("GHS09");
 }
 if(noGhs) pics=[];
 d.ghsPictograms=[...new Set(pics)];
 let nfpa=text.match(/NFPA Hazard ID:\s*Health:\s*(\d)\s*Flammability:\s*(\d)\s*Reactivity:\s*(\d)/i);
 if(nfpa){d.nfpa={health:+nfpa[1],fire:+nfpa[2],reactivity:+nfpa[3],special:"-"}}
 else{
   let fp=(text.match(/(?:Flash Point|Punto de inflamación)[^\d>]*(>?)(\d{2,3})/i)||[])[2];
   d.nfpa.fire=fp ? (parseInt(fp)<93?2:1) : (/not flammable|no inflamable/i.test(text)?0:1);
   d.nfpa.health=/serious eye damage|lesión ocular grave|corros/i.test(text)?2:(/irrit|injection|inyección|tos|cough/i.test(text)?1:0);
   d.nfpa.reactivity=/stable|estable|non-reactive/i.test(text)?0:0;
 }
 if(/not regulated|no está clasificado como producto peligroso|no regulado/i.test(text)) d.transportFooter="NO REGULADO COMO MERCANCÍA PELIGROSA PARA TRANSPORTE TERRESTRE, MARÍTIMO Y AÉREO";
 d.risks=[
  /high-pressure injection|inyección a alta presión/i.test(text)?"La inyección a alta presión bajo la piel puede causar daño grave.":"",
  /irrit/i.test(text)?"Puede causar irritación por exposición prolongada o contacto.":"",
  /used oil|aceite usado/i.test(text)?"El aceite usado puede contener impurezas nocivas.":"",
  /not flammable|no inflamable/i.test(text)?"No está clasificado como inflamable, pero puede arder si se calienta.":""
 ].filter(Boolean);
 if(!d.risks.length)d.risks=defaults.risks;
 d.firstAid=defaults.firstAid; d.storage=defaults.storage;
 return d;
}
function fill(d){
 $("productName").value=d.productName||defaults.productName; $("productUse").value=d.productUse||defaults.productUse; $("casNumber").value=d.casNumber||defaults.casNumber; $("signalWord").value=d.signalWord||defaults.signalWord;
 $("nfpaH").value=d.nfpa?.health??1; $("nfpaF").value=d.nfpa?.fire??1; $("nfpaR").value=d.nfpa?.reactivity??0; $("nfpaS").value=d.nfpa?.special??"-";
 [...$("ghsSelect").options].forEach(o=>o.selected=(d.ghsPictograms||[]).includes(o.value));
 $("ppe").value=(d.ppe||defaults.ppe).join("\n"); $("risks").value=(d.risks||defaults.risks).join("\n"); $("firstAid").value=(d.firstAid||defaults.firstAid).join("\n"); $("storage").value=(d.storage||defaults.storage).join("\n");
 $("environment").value=d.environment||defaults.environment; $("disposal").value=d.disposal||defaults.disposal; $("transport").value=d.transportFooter||defaults.transportFooter;
}
function eppIcon(t){t=t.toLowerCase(); if(/gafa|lente|ojo/.test(t))return"🥽"; if(/guante/.test(t))return"🧤"; if(/resp|mascar/.test(t))return"😷"; if(/bota|calzado/.test(t))return"🥾"; if(/ropa|manga|traje/.test(t))return"🥼"; if(/audit|oído|oido/.test(t))return"🎧"; if(/casco/.test(t))return"⛑️"; return"🛡️";}
function render(){
 $("posterLogo").src=logoUrl; $("outName").textContent=$("productName").value||"PRODUCTO QUÍMICO"; $("outUse").textContent=$("productUse").value||"Uso según SDS"; $("outCas").textContent=$("casNumber").value||"No indicado";
 $("outH").textContent=$("nfpaH").value; $("outF").textContent=$("nfpaF").value; $("outR").textContent=$("nfpaR").value; $("outS").textContent=$("nfpaS").value||"-";
 $("legH").textContent=$("nfpaH").value+" = "+($("nfpaH").value==0?"Riesgo mínimo.":"Riesgo leve/moderado según SDS."); $("legF").textContent=$("nfpaF").value+" = "+($("nfpaF").value==0?"No combustible bajo condiciones normales.":"Combustible si se calienta."); $("legR").textContent=$("nfpaR").value+" = Estable."; $("legS").textContent=($("nfpaS").value||"-")+" = Ninguno.";
 const pics=[...$("ghsSelect").selectedOptions].map(o=>o.value);
 $("outSignal").innerHTML=pics.length?(($("signalWord").value||"ATENCIÓN")+"<br>SGA / GHS"):"NO CLASIFICADO<br>SGA / GHS"; $("ghsNote").textContent=pics.length?"Pictogramas aplicables según SDS/FDS.":"Sin pictogramas GHS. Sin palabra de advertencia.";
 $("ghsIcons").innerHTML=pics.map(p=>`<div class="ghsItem"><div class="ghsDiamond"><span>${GHS[p][0]}</span></div>${p}<br>${GHS[p][1]}</div>`).join("");
 $("outPpe").innerHTML=splitLines($("ppe").value).slice(0,8).map(x=>`<div class="ppe"><div class="ppeIcon">${eppIcon(x)}</div>${x}</div>`).join("");
 $("outRisks").innerHTML=splitLines($("risks").value).map(x=>`<li>${x}</li>`).join(""); $("outAid").innerHTML=splitLines($("firstAid").value).map(x=>`<li>${x}</li>`).join(""); $("outStorage").innerHTML=splitLines($("storage").value).map(x=>`<li>${x}</li>`).join("");
 $("outEnv").textContent=$("environment").value; $("outDisposal").textContent=$("disposal").value; $("footer").textContent=$("transport").value;
}
$("renderBtn").onclick=render;
async function makeCanvas(){render();return await html2canvas($("poster"),{scale:2,backgroundColor:"#fff",useCORS:true})}
$("pngBtn").onclick=async()=>{let c=await makeCanvas();let a=document.createElement("a");a.download=($("productName").value||"rotulo").replace(/[^a-z0-9]+/gi,"_")+".png";a.href=c.toDataURL("image/png");a.click()}
$("pdfBtn").onclick=async()=>{let c=await makeCanvas();let img=c.toDataURL("image/png");let {jsPDF}=window.jspdf;let pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a3"});pdf.addImage(img,"PNG",5,5,410,287);pdf.save(($("productName").value||"rotulo").replace(/[^a-z0-9]+/gi,"_")+"_A3_horizontal.pdf")}
fill(defaults);render();