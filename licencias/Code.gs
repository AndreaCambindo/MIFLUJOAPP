/**
 * MiFlujo — Servidor de licencias (Google Apps Script)
 *
 * Se pega en una hoja de Google Sheets (Extensiones → Apps Script) y se publica como
 * "Aplicación web". La app MiFlujo le pregunta aquí si un código de licencia sigue vigente
 * y recibe un "pase" firmado que le permite abrir durante unos días.
 *
 * Guía de instalación paso a paso: LEEME.md (en esta misma carpeta).
 */

/* ======================= AJUSTES (puedes cambiarlos) ======================= */
const PASE_DIAS = 7;          // días que dura un pase antes de pedir renovación (la app lo renueva sola con internet)
const GRACIA_DIAS = 3;        // días extra de tolerancia después de que vence la licencia
const MAX_DISP_DEFECTO = 3;   // dispositivos por licencia si no indicas otro número

/* ======================= NOMBRES DE LAS HOJAS ======================= */
const HOJA_LIC = 'Licencias';
const HOJA_DISP = 'Dispositivos';
const ENC_LIC = ['codigo', 'correo', 'plan', 'estado', 'vigente_hasta', 'creada', 'max_dispositivos', 'nota'];
const ENC_DISP = ['codigo', 'dispositivo', 'referencia', 'nombre', 'activado', 'ultima_validacion'];
const PLANES = { prueba: 'prueba', mensual: 'mensual', anual: 'anual', unico: 'unico', 'único': 'unico' };

/* ======================= MENÚ EN LA HOJA ======================= */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('MiFlujo')
    .addItem('1. Configuración inicial', 'configurar')
    .addSeparator()
    .addItem('Crear licencia…', 'menuCrear')
    .addItem('Extender licencia…', 'menuExtender')
    .addItem('Revocar licencia…', 'menuRevocar')
    .addToUi();
}

function configurar() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('HOJA_ID', ss.getId());
  hoja_(HOJA_LIC, ENC_LIC);
  hoja_(HOJA_DISP, ENC_DISP);
  try {
    firmar_({ prueba: true });
  } catch (err) {
    ui.alert('Falta un paso',
      'Aún no está bien la CLAVE_PRIVADA.\n\nEn Apps Script: ⚙ Configuración del proyecto → Propiedades de la secuencia de comandos → ' +
      'agrega CLAVE_PRIVADA con la clave privada que te dio generar-claves.html.\n\nDetalle: ' + err.message, ui.ButtonSet.OK);
    return;
  }
  ui.alert('Todo listo', 'Las hojas están creadas y la firma funciona. Ya puedes crear licencias desde el menú MiFlujo.', ui.ButtonSet.OK);
}

function menuCrear() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt('Crear licencia', 'Correo del comprador:', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const r2 = ui.prompt('Plan', 'Escribe uno: prueba (7 días), mensual, anual o unico (sin vencimiento)', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  const plan = PLANES[String(r2.getResponseText()).trim().toLowerCase()];
  if (!plan) { ui.alert('Plan no válido', 'Usa: prueba, mensual, anual o unico.', ui.ButtonSet.OK); return; }
  const lic = crearLicencia_(r1.getResponseText(), plan);
  let enviado = false;
  if (lic.correo && ui.alert('¿Enviar el código por correo a ' + lic.correo + '?', ui.ButtonSet.YES_NO) === ui.Button.YES) {
    try { enviarCodigo_(lic); enviado = true; } catch (err) { ui.alert('No se pudo enviar el correo', err.message, ui.ButtonSet.OK); }
  }
  ui.alert('Licencia creada', 'Código: ' + lic.codigo + '\nPlan: ' + lic.plan +
    '\nVigente hasta: ' + (lic.vigente || 'sin vencimiento') + (enviado ? '\n\nSe envió por correo.' : ''), ui.ButtonSet.OK);
}

function menuExtender() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt('Extender licencia', 'Código de la licencia:', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const r2 = ui.prompt('Extender licencia', '¿Cuántos meses quieres sumar?', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  const res = extenderLicencia_(r1.getResponseText(), parseInt(r2.getResponseText(), 10));
  ui.alert(res.ok ? 'Listo' : 'No se pudo', res.mensaje, ui.ButtonSet.OK);
}

function menuRevocar() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt('Revocar licencia', 'Código de la licencia a desactivar:', ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const res = revocarLicencia_(r1.getResponseText());
  ui.alert(res.ok ? 'Listo' : 'No se pudo', res.mensaje, ui.ButtonSet.OK);
}

/* ======================= LO QUE RESPONDE A LA APP ======================= */
function doGet() {
  return salida_({ ok: true, servicio: 'MiFlujo licencias' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return salida_(error_('peticion', 'Petición inválida.')); }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (req.accion === 'activar') return salida_(activar_(req));
    if (req.accion === 'liberar') return salida_(liberar_(req));
    return salida_(error_('peticion', 'Acción desconocida.'));
  } catch (err) {
    console.error(err);
    return salida_(error_('servidor', 'El servidor tuvo un problema. Intenta de nuevo en un momento.'));
  } finally {
    try { lock.releaseLock(); } catch (x) { /* nada */ }
  }
}

/** Activa un dispositivo o renueva su pase (es la misma operación). */
function activar_(req) {
  const codigo = norm_(req.codigo);
  const disp = String(req.dispositivo || '').slice(0, 64);
  const nombre = String(req.nombre || 'Dispositivo').slice(0, 60);
  if (!codigo || !disp) return error_('peticion', 'Faltan datos.');

  const lic = buscar_(codigo);
  if (!lic) return error_('no_existe', 'Ese código no existe. Revisa que esté completo.');
  if (!lic.activa) return error_('revocada', 'Esta licencia fue desactivada. Escríbenos para ayudarte.');
  const hoy = fechaStr_(new Date());
  if (lic.vigente && hoy > lic.vigente) return error_('vencida', 'Tu licencia venció el ' + lic.vigente + '.', { vigenteHasta: lic.vigente });

  const sh = hoja_(HOJA_DISP, ENC_DISP);
  const filas = sh.getDataRange().getValues();
  const mios = [];
  let fila = -1;
  for (let i = 1; i < filas.length; i++) {
    if (norm_(filas[i][0]) !== codigo) continue;
    mios.push({ referencia: String(filas[i][2]), nombre: String(filas[i][3]), ultima: fechaStr_(filas[i][5]) });
    if (String(filas[i][1]) === disp) fila = i + 1;
  }
  if (fila < 0 && mios.length >= lic.max) {
    return error_('dispositivos_llenos', 'Esta licencia ya está en ' + lic.max + ' dispositivos. Libera uno para usar este.', { dispositivos: mios, max: lic.max });
  }

  // Primero se firma el pase: si algo falla, el dispositivo no queda ocupando un cupo.
  const ahora = new Date();
  let vence = ahora.getTime() + PASE_DIAS * 864e5;
  if (lic.vigente) vence = Math.min(vence, finDeDia_(lic.vigente) + GRACIA_DIAS * 864e5);
  const pase = firmar_({ v: 1, d: disp, p: lic.plan, h: lic.vigente || '', i: ahora.getTime(), e: vence });

  if (fila > 0) {
    sh.getRange(fila, 4).setValue(nombre);
    sh.getRange(fila, 6).setValue(ahora);
  } else {
    sh.appendRow([codigo, disp, Utilities.getUuid().replace(/-/g, '').slice(0, 6), nombre, ahora, ahora]);
  }
  return { ok: true, pase: pase, licencia: { plan: lic.plan, vigenteHasta: lic.vigente || null, max: lic.max } };
}

/** Libera un dispositivo (el propio o uno de la lista) para dejar espacio. */
function liberar_(req) {
  const codigo = norm_(req.codigo);
  if (!buscar_(codigo)) return error_('no_existe', 'Ese código no existe.');
  const sh = hoja_(HOJA_DISP, ENC_DISP);
  const filas = sh.getDataRange().getValues();
  let n = 0;
  for (let i = filas.length - 1; i >= 1; i--) {
    if (norm_(filas[i][0]) !== codigo) continue;
    const esPropio = req.dispositivo && String(filas[i][1]) === String(req.dispositivo);
    const esReferencia = req.referencia && String(filas[i][2]) === String(req.referencia);
    if (esPropio || esReferencia) { sh.deleteRow(i + 1); n++; }
  }
  return { ok: true, liberados: n };
}

/* ======================= ADMINISTRACIÓN DE LICENCIAS ======================= */
function crearLicencia_(correo, plan, max, nota) {
  const hoy = new Date();
  let vigente = '';
  if (plan === 'prueba') vigente = fechaStr_(sumarDias_(hoy, 7));
  else if (plan === 'mensual') vigente = fechaStr_(sumarMeses_(hoy, 1));
  else if (plan === 'anual') vigente = fechaStr_(sumarMeses_(hoy, 12));
  const h = Utilities.getUuid().replace(/-/g, '').toUpperCase();
  const codigo = 'MFL-' + h.slice(0, 4) + '-' + h.slice(4, 8) + '-' + h.slice(8, 12);
  hoja_(HOJA_LIC, ENC_LIC).appendRow([codigo, String(correo || '').trim(), plan, 'Activa', vigente, hoy, max || MAX_DISP_DEFECTO, nota || '']);
  return { codigo: codigo, correo: String(correo || '').trim(), plan: plan, vigente: vigente };
}

function extenderLicencia_(codigo, meses) {
  if (!meses || meses < 1) return { ok: false, mensaje: 'Indica un número de meses mayor que 0.' };
  const lic = buscar_(norm_(codigo));
  if (!lic) return { ok: false, mensaje: 'No encontré ese código.' };
  if (!lic.vigente) return { ok: false, mensaje: 'Esa licencia no tiene vencimiento: no hay nada que extender.' };
  const hoy = fechaStr_(new Date());
  const base = parseFecha_(lic.vigente > hoy ? lic.vigente : hoy);
  const nueva = fechaStr_(sumarMeses_(base, meses));
  const sh = hoja_(HOJA_LIC, ENC_LIC);
  sh.getRange(lic.fila, 5).setValue(nueva);
  sh.getRange(lic.fila, 4).setValue('Activa');
  return { ok: true, mensaje: 'Ahora vence el ' + nueva + '.' };
}

function revocarLicencia_(codigo) {
  const lic = buscar_(norm_(codigo));
  if (!lic) return { ok: false, mensaje: 'No encontré ese código.' };
  hoja_(HOJA_LIC, ENC_LIC).getRange(lic.fila, 4).setValue('Revocada');
  return { ok: true, mensaje: 'La licencia quedó revocada. La app se bloqueará cuando se venza el pase actual.' };
}

function enviarCodigo_(lic) {
  const url = PropertiesService.getScriptProperties().getProperty('URL_APP') || '';
  const cuerpo = 'Hola,\n\nGracias por elegir MiFlujo. Este es tu código de licencia:\n\n    ' + lic.codigo + '\n\n' +
    (url ? 'Abre la app aquí: ' + url + '\n' : '') +
    'Pega el código en la pantalla de bienvenida. Puedes usarlo hasta en ' + MAX_DISP_DEFECTO + ' dispositivos.\n' +
    (lic.vigente ? 'Tu licencia está vigente hasta el ' + lic.vigente + '.\n' : '') +
    '\nGuarda este correo: lo necesitarás si cambias de teléfono.\n';
  MailApp.sendEmail(lic.correo, 'Tu código de MiFlujo', cuerpo);
}

/* ======================= AYUDAS INTERNAS ======================= */
function hoja_(nombre, encabezado) {
  const id = PropertiesService.getScriptProperties().getProperty('HOJA_ID');
  const ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);
  if (sh.getLastRow() === 0) {
    sh.appendRow(encabezado);
    sh.getRange(1, 1, 1, encabezado.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function buscar_(codigo) {
  if (!codigo) return null;
  const filas = hoja_(HOJA_LIC, ENC_LIC).getDataRange().getValues();
  for (let i = 1; i < filas.length; i++) {
    if (norm_(filas[i][0]) !== codigo) continue;
    const estado = String(filas[i][3]).trim().toLowerCase();
    const max = parseInt(filas[i][6], 10);
    return {
      fila: i + 1,
      codigo: codigo,
      correo: String(filas[i][1]),
      plan: String(filas[i][2] || 'mensual'),
      activa: estado === 'activa' || estado === 'activo',
      vigente: fechaStr_(filas[i][4]),
      max: max > 0 ? max : MAX_DISP_DEFECTO
    };
  }
  return null;
}

function norm_(c) { return String(c || '').trim().toUpperCase(); }

function error_(codigo, mensaje, extra) {
  const o = { ok: false, error: codigo, mensaje: mensaje };
  if (extra) for (const k in extra) o[k] = extra[k];
  return o;
}

function salida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Devuelve 'AAAA-MM-DD' (o '' si no hay fecha) sea cual sea la forma en que esté escrita en la hoja. */
function fechaStr_(v) {
  if (v === '' || v === null || v === undefined) return '';
  const tz = Session.getScriptTimeZone();
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function parseFecha_(s) {
  const p = String(s).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
}

/** Último instante del día indicado, en la zona horaria de la hoja. */
function finDeDia_(s) {
  const d = parseFecha_(s);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function sumarDias_(d, n) { const r = new Date(d.getTime()); r.setDate(r.getDate() + n); return r; }
function sumarMeses_(d, n) { const r = new Date(d.getTime()); r.setMonth(r.getMonth() + n); return r; }

/** Firma el pase con la clave privada (RSA + SHA-256). La app lo verifica con la clave pública. */
function firmar_(payload) {
  const p = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8);
  const firma = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(p, clavePem_()));
  return p + '.' + firma;
}

function clavePem_() {
  const crudo = PropertiesService.getScriptProperties().getProperty('CLAVE_PRIVADA') || '';
  const b64 = crudo.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  if (!b64) throw new Error('Falta la propiedad CLAVE_PRIVADA.');
  return '-----BEGIN PRIVATE KEY-----\n' + b64.match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n';
}
