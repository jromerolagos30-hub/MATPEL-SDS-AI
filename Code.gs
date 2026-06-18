/**
 * MATPEL SDS/FDS Web App v1
 * Backend para GitHub Pages.
 * Funciones:
 * 1) Recibe PDF en base64.
 * 2) Convierte PDF a Google Doc usando OCR de Drive para extraer texto.
 * 3) Si existe Script Property OPENAI_API_KEY, analiza con IA y devuelve JSON técnico.
 * 4) Si no existe OPENAI_API_KEY, usa analizador por reglas como respaldo.
 *
 * Requisitos Apps Script:
 * - Servicios avanzados de Google: Drive API activado.
 * - En Google Cloud del proyecto: Drive API activado.
 * - Implementar como Web App: Ejecutar como yo / Acceso cualquiera.
 */

const FOLDER_NAME = 'MATPEL_SDS_TEMP_V1';
const OPENAI_MODEL = 'gpt-4.1-mini';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (!body.base64) throw new Error('No se recibió PDF en base64.');

    const blob = Utilities.newBlob(
      Utilities.base64Decode(body.base64),
      body.mimeType || 'application/pdf',
      body.filename || 'sds.pdf'
    );

    const file = getFolder_().createFile(blob);
    const text = convertPdfToText_(file.getId(), body.filename || 'sds.pdf');
    cleanup_(file.getId());

    const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
    let rotulo, mode;
    if (apiKey) {
      rotulo = analyzeWithOpenAI_(text, apiKey);
      mode = 'ai';
    } else {
      rotulo = analyzeSdsText_(text);
      mode = 'rules';
    }

    return json_({ ok: true, mode, text: text.substring(0, 50000), rotulo });
  } catch (err) {
    return json_({ ok: false, error: err.message || String(err) });
  }
}

function doGet() {
  return json_({ ok: true, service: 'MATPEL SDS/FDS Web App v1' });
}

function getFolder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function convertPdfToText_(fileId, filename) {
  const resource = { title: 'OCR_' + filename, mimeType: MimeType.GOOGLE_DOCS };
  const copied = Drive.Files.copy(resource, fileId, { ocr: true, ocrLanguage: 'es' });
  const doc = DocumentApp.openById(copied.id);
  const text = doc.getBody().getText();
  DriveApp.getFileById(copied.id).setTrashed(true);
  return text;
}

function cleanup_(fileId) {
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch(e) {}
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function analyzeWithOpenAI_(text, apiKey) {
  const prompt = `Actúa como especialista en MATPEL, Medio Ambiente, NFPA 704 y SGA/GHS.
Analiza estrictamente la SDS/FDS entregada. Devuelve SOLO JSON válido, sin markdown.
No inventes datos que no estén soportados por la SDS. Si la SDS no da NFPA, propón NFPA técnico conservador y justifícalo en campos breves.
Debes priorizar: clasificación SGA/GHS, pictogramas, palabra de advertencia, EPP exacto de la sección 8, primeros auxilios sección 4, almacenamiento sección 7, ambiente sección 12, eliminación sección 13 y transporte sección 14.

Esquema JSON obligatorio:
{
  "product":"",
  "use":"",
  "nfpa":{"h":0,"f":0,"r":0,"s":"—"},
  "nfpaJustification":"",
  "ghs":[["emoji","GHSxx","texto corto"]],
  "noGhs":true,
  "signal":"NO CLASIFICADO|ATENCIÓN|PELIGRO",
  "epp":[["emoji","texto corto"]],
  "risks":["máx 5 riesgos principales"],
  "environment":"texto corto",
  "firstAid":{"inhalacion":"","piel":"","ojos":"","ingestion":""},
  "storage":["máx 5 puntos"],
  "footer":"texto transporte"
}

Reglas:
- Si dice sin pictogramas, ghs debe ser [] y noGhs true.
- Si hay GHS, usa solo pictogramas aplicables: GHS02 llama, GHS03 comburente, GHS05 corrosión, GHS07 exclamación, GHS08 peligro salud, GHS09 ambiente.
- EPP debe salir de la SDS, no agregues botas o respirador si la SDS no lo indica. Si respirador es condicional, escribe "Protección respiratoria*".
- Para el footer usa si aplica: "NO REGULADO COMO MERCANCÍA PELIGROSA PARA TRANSPORTE TERRESTRE, MARÍTIMO Y AÉREO".

SDS/FDS:
${text.substring(0, 45000)}`;

  const payload = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: 'Eres un especialista HSE/MATPEL. Respondes únicamente JSON válido.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    response_format: { type: 'json_object' }
  };

  const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  const raw = res.getContentText();
  if (code < 200 || code >= 300) throw new Error('OpenAI API error ' + code + ': ' + raw.substring(0, 300));

  const obj = JSON.parse(raw);
  const content = obj.choices && obj.choices[0] && obj.choices[0].message && obj.choices[0].message.content;
  if (!content) throw new Error('OpenAI no devolvió contenido.');
  return normalizeRotulo_(JSON.parse(content));
}

function normalizeRotulo_(d) {
  d = d || {};
  d.product = d.product || 'PRODUCTO QUÍMICO';
  d.use = d.use || 'Uso indicado según SDS/FDS.';
  d.nfpa = d.nfpa || { h:1, f:1, r:0, s:'—' };
  d.nfpa.h = Number(d.nfpa.h || 0);
  d.nfpa.f = Number(d.nfpa.f || 0);
  d.nfpa.r = Number(d.nfpa.r || 0);
  d.nfpa.s = d.nfpa.s || '—';
  d.ghs = d.ghs || [];
  d.noGhs = Boolean(d.noGhs || d.ghs.length === 0);
  d.signal = d.signal || (d.noGhs ? 'NO CLASIFICADO' : 'ATENCIÓN');
  d.epp = d.epp || [['🥽','Gafas de seguridad'], ['🧤','Guantes de protección'], ['🥼','Ropa de trabajo']];
  d.risks = d.risks || ['Manipular conforme a buenas prácticas de higiene industrial.'];
  d.environment = d.environment || 'Evitar derrames al suelo, desagües y cuerpos de agua.';
  d.firstAid = d.firstAid || { inhalacion:'Trasladar al aire fresco.', piel:'Lavar con agua y jabón.', ojos:'Enjuagar con abundante agua.', ingestion:'Enjuagar la boca. No inducir el vómito.' };
  d.storage = d.storage || ['Almacenar en envase original bien cerrado.', 'Mantener en lugar fresco, seco y ventilado.', 'Mantener alejado de materiales incompatibles.', 'Lavarse las manos después del uso.'];
  d.footer = d.footer || 'NO REGULADO COMO MERCANCÍA PELIGROSA PARA TRANSPORTE TERRESTRE, MARÍTIMO Y AÉREO';
  return d;
}

function analyzeSdsText_(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const up = t.toUpperCase();
  const product = first_(t, [
    /(?:Product Name|Nombre del Producto|Nombre comercial|Producto)\s*[:：]?\s*([^\n\.]{3,90})/i,
    /(Shell\s+Omala\s+S2\s+GX\s+\d+|Shell\s+Tellus\s+S2\s+MX\s+\d+|CAT\s+DEO\s+15W-40|WR\s*89\s*NewGeneration|Petr[oó]leo\s+Diesel\s+B5)/i
  ]) || 'PRODUCTO QUÍMICO';

  const use = /HYDRAULIC|HIDR[ÁA]ULICO|ACEITE HIDR/.test(up) ? 'Aceite hidráulico.' :
    /GEAR|ENGRANAJE|OMALA/.test(up) ? 'Lubricante de engranajes.' :
    /ENGINE OIL|MOTOR|DEO/.test(up) ? 'Aceite lubricante para motores diésel.' :
    /WR\s*89|MECANIZADO|REFRIGERANTE|COOLANT/.test(up) ? 'Lubricante refrigerante para operaciones de mecanizado y rectificado de metales.' :
    /DIESEL B5|PETR[ÓO]LEO/.test(up) ? 'Combustible diésel B5.' : 'Uso indicado según SDS/FDS.';

  let nfpa = { h: 1, f: 1, r: 0, s: '—' };
  const nf = up.match(/NFPA[^\n]{0,160}HEALTH\s*:?\s*(\d)[^\n]{0,80}FLAMMABILITY\s*:?\s*(\d)[^\n]{0,80}REACTIVITY\s*:?\s*(\d)/);
  if (nf) nfpa = { h:+nf[1], f:+nf[2], r:+nf[3], s:'—' };
  if (/COR|CORROSIVO/.test(up)) nfpa.s = 'COR';
  const flash = parseFloat((up.match(/FLASH POINT[^0-9>]*(?:>|&GT;)?\s*(\d+)/) || [])[1] || '0');
  if (flash > 200 && nfpa.f < 1) nfpa.f = 1;

  const ghs = [];
  if (/GHS02|FLAMMABLE|INFLAMABLE|IGNITION|FUENTES DE IGNICI[ÓO]N/.test(up)) ghs.push(['🔥','GHS02','INFLAMABLE']);
  if (/GHS03|OXID|COMBURENTE/.test(up)) ghs.push(['⭕','GHS03','COMBURENTE']);
  if (/GHS05|CORROS/.test(up)) ghs.push(['🧪','GHS05','CORROSIVO']);
  if (/GHS07|IRRIT|TOXICIDAD AGUDA|EXCLAM/.test(up)) ghs.push(['!','GHS07','IRRITANTE']);
  if (/GHS08|ASPIRATION|H304|CARCIN|MUTAG|REPRO/.test(up)) ghs.push(['♟','GHS08','PELIGRO SALUD']);
  if (/GHS09|AQUATIC|H400|H410|H411|AMBIENTE ACU[ÁA]TICO/.test(up)) ghs.push(['🌳','GHS09','AMBIENTE']);
  const noGhs = /(NO SE REQUIERE NING[ÚU]N S[ÍI]MBOLO|NO CLASIFICADO|NOT CLASSIFIED|NO CUMPLE CON LOS CRITERIOS|NOT HAZARDOUS)/.test(up) && ghs.length === 0;

  const epp = [];
  if (/EYE|OJOS|GAFAS|EN166|GOGGLES/.test(up)) epp.push(['🥽','Gafas de seguridad']);
  if (/GLOVE|GUANTES|NITRILE|NITRILO|PVC|NEOPRENO/.test(up)) epp.push(['🧤','Guantes de protección']);
  if (/WORK CLOTHING|ROPA|LONG SLEEVED|MANGA LARGA|BODY/.test(up)) epp.push(['🥼','Ropa de trabajo']);
  if (/BOOT|CALZADO|BOTAS/.test(up)) epp.push(['🥾','Botas de seguridad']);
  if (/RESPIRATORY|RESPIRATOR|RESPIRATORIA|VENTILACI[ÓO]N INSUFICIENTE|NEBLINA|MIST/.test(up)) epp.push(['😷','Protección respiratoria*']);
  if (epp.length === 0) epp.push(['🥽','Gafas de seguridad'], ['🧤','Guantes de protección'], ['🥼','Ropa de trabajo']);

  const risks = [];
  if (/INJECTION|INYECCI[ÓO]N/.test(up)) risks.push('La inyección a alta presión bajo la piel puede causar daño grave.');
  if (/ALLERGIC|AL[ÉE]RGICA|SENS/.test(up)) risks.push('Puede provocar reacción alérgica en personas sensibilizadas.');
  if (/IRRIT|OJO|EYE/.test(up)) risks.push('Puede causar irritación leve en ojos, piel o vías respiratorias.');
  if (/USED OIL|ACEITE USADO/.test(up)) risks.push('El aceite usado puede contener impurezas nocivas.');
  if (/NOT CLASSIFIED AS FLAMMABLE|NO EST[ÁA] CLASIFICADO COMO INFLAMABLE|PUEDE ARDER/.test(up)) risks.push('No está clasificado como inflamable, pero puede arder si se calienta.');
  if (/DIESEL B5|PETR[ÓO]LEO/.test(up)) risks.push('Mantener alejado de calor, chispas, llamas y fuentes de ignición.');
  if (risks.length === 0) risks.push('Manipular conforme a buenas prácticas de higiene industrial.', 'Evitar contacto prolongado o repetido con la piel.');

  return normalizeRotulo_({
    product: product.replace(/\s+/g, ' ').trim(),
    use, nfpa, ghs, noGhs,
    signal: /PELIGRO|DANGER/.test(up) ? 'PELIGRO' : (noGhs ? 'NO CLASIFICADO' : 'ATENCIÓN'),
    epp, risks,
    environment: /(NOT CLASSIFIED AS AN ENVIRONMENTAL HAZARD|NO SE CLASIFICA COMO.*MEDIO AMBIENTE|NO SIGNIFICANT.*ENVIRONMENTAL)/.test(up) ? 'No se clasifica como peligroso para el medio ambiente.' : 'Evitar derrames al suelo, desagües y cuerpos de agua.'
  });
}

function first_(text, regexes) {
  for (const re of regexes) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return '';
}
