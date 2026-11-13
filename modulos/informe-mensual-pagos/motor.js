// Motor de cálculo: Informe mensual de contratación y pagos del FDL Usme.
// Toma la Base de contratación que envía el área (No. | NÚMERO DEL CONTRATO | contratista | ... |
// valor pagado y girado a la fecha) y la llena con la Autorización de giro del Reporte CRP de BogData.
// Es la misma regla de la macro CruzarValorGirado: llave No. Compromiso = número de contrato,
// suma de Autorización giro de todos los registros del compromiso. Funciona en navegador y en Node.
(function (root) {
  const TOL = 1; // pesos

  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
  const num = v => {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    const t = String(v == null ? '' : v).trim(); if (!t) return 0;
    const n = parseFloat(t.replace(/\$|\s/g, '').replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };
  const txt = v => v == null ? '' : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
  function fecha(v) {
    if (v instanceof Date && !isNaN(v)) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
    if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v + 0.001) * 864e5);
    const s = txt(v).trim();
    let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(s);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return null;
  }
  const iso = d => d ? d.toISOString().slice(0, 10) : '';

  // ---------- Llave de contrato: "NNN-AAAA" o "NNNA-AAAA" (sin ceros a la izquierda) ----------
  // La letra (117A-2026) se conserva: es otro contrato, no una adición del 117-2026.
  const RE_LLAVE = /^\D*?0*(\d{1,4})\s*-?\s*([A-Z])?\s*-\s*(20[12]\d)/;
  function llaveBase(valor, vigencia) {
    const s = txt(valor).toUpperCase().replace(/\s+/g, ' ').trim();
    if (!s) return { llave: '', motivo: 'Sin número de contrato' };
    const m = RE_LLAVE.exec(s);
    if (m) return { llave: (+m[1]) + (m[2] || '') + '-' + m[3], motivo: '' };
    const n = /^\D*?0*(\d{1,4})\s*([A-Z])?$/.exec(s);
    if (n && vigencia) return { llave: (+n[1]) + (n[2] || '') + '-' + vigencia, motivo: 'Sin año: se toma la vigencia ' + vigencia };
    return { llave: '', motivo: 'No se reconoce el número de contrato: «' + s + '»' };
  }
  // No. Compromiso del CRP. 657-20231 y 657-2023 son el mismo contrato. Solo cruza si trae número y año:
  // compromisos como «EDIL 1» (honorarios de ediles) o facturas no son contratos de la Base.
  function llaveCRP(nocomp) {
    const m = RE_LLAVE.exec(txt(nocomp).toUpperCase().trim());
    return m ? (+m[1]) + (m[2] || '') + '-' + m[3] : '';
  }
  // «134 DE 2026» suele ser una resolución u otro acto con el mismo número: no se suma, solo se avisa.
  function llaveParecida(nocomp) {
    const m = /^\D*?0*(\d{1,4})\s+DE\s+(20[12]\d)/.exec(txt(nocomp).toUpperCase().trim());
    return m ? (+m[1]) + '-' + m[2] : '';
  }

  // ---------- Lectura de la Base ----------
  const BASE = {
    no: h => h === 'NO' || h === 'NUMERO' || h === 'ITEM', contrato: h => h.startsWith('NUMERODELCONTRATO') || h === 'NUMEROCONTRATO' || h === 'CONTRATO',
    nombre: h => h.startsWith('NOMBREDELCONTRATISTA') || h === 'CONTRATISTA', persona: h => h.startsWith('TIPODEPERSONA'),
    tdoc: h => h.startsWith('TIPODEDOCUMENTO'), doc: h => h.startsWith('NUMERODECEDULA') || h.startsWith('NUMERODEDOCUMENTO') || h === 'NIT' || h === 'CEDULA',
    valor: h => h.startsWith('VALORPAGADO') || (h.includes('GIRADO') && h.startsWith('VALOR'))
  };
  function leerBase(rows) {
    for (let h = 0; h < Math.min(30, rows.length); h++) {
      const hdr = (rows[h] || []).map(norm), cols = {};
      for (const [k, f] of Object.entries(BASE)) { const i = hdr.findIndex(f); if (i >= 0) cols[k] = i; }
      if (!('contrato' in cols && 'valor' in cols)) continue;
      const filas = [];
      const vigs = {};
      for (let i = h + 1; i < rows.length; i++) {
        const m = RE_LLAVE.exec(txt((rows[i] || [])[cols.contrato]).toUpperCase().trim()); if (m) vigs[m[3]] = (vigs[m[3]] || 0) + 1;
      }
      const vigencia = +(Object.entries(vigs).sort((a, b) => b[1] - a[1])[0] || [0])[0] || 0;
      for (let i = h + 1; i < rows.length; i++) {
        const r = rows[i] || [], g = k => k in cols ? r[cols[k]] : '';
        const contrato = txt(g('contrato')).trim(), nombre = txt(g('nombre')).trim();
        if (!contrato && !nombre && !txt(g('no')).trim()) continue;
        const { llave, motivo } = llaveBase(contrato, vigencia);
        filas.push({ row: i + 1, no: txt(g('no')).trim(), contrato, nombre, persona: txt(g('persona')).trim(), doc: txt(g('doc')).trim(), llave, motivo, previo: txt(g('valor')).trim() === '' ? null : num(g('valor')) });
      }
      return { headerRow: h + 1, cols, filas, vigencia, encabezadoValor: txt((rows[h] || [])[cols.valor]) };
    }
    throw new Error('No encontré la Base de contratación. Se necesitan las columnas NUMERO DEL CONTRATO y «valor pagado y girado a la fecha».');
  }

  // ---------- Lectura del Reporte CRP ----------
  const CRP = {
    ejercicio: h => h === 'EJERCICIO', fecha: h => h === 'FECHAREGISTRO', nocomp: [h => h === 'NOCOMPROMISO', h => h === 'NUMERODECOMPROMISO' || h === 'NROCOMPROMISO', h => h === 'COMPROMISO'],
    objeto: h => h === 'OBJETO', fondo: h => h === 'DESCRIPCIONDELFONDO' || h === 'FONDO', crp: h => h === 'NUMERODECRP',
    vcrp: h => h === 'VALORCRP', anul: h => h === 'ANULACIONES', neto: h => h === 'VALORNETO',
    giro: h => h === 'AUTORIZACIONGIRO' || h === 'AUTORIZACIONDEGIRO', sinaut: h => h.includes('SINAUT'),
    benef: h => h === 'NOMBREBPBENEFICIARIO' || h === 'NOMBREBENEFICIARIO' || h === 'BENEFICIARIO',
    docBenef: [h => h === 'NUMERODOCBPBENEFICIARIO' || h === 'NUMERODOCUMENTOBENEFICIARIO', h => h.includes('IDENTIFICACIONBENEFICIARIO') || h === 'NITBENEFICIARIO']
  };
  const REQ_CRP = ['nocomp', 'giro'];
  function leerCRP(rows) {
    for (let h = 0; h < Math.min(25, rows.length); h++) {
      const hdr = (rows[h] || []).map(norm), cols = {};
      for (const [k, f] of Object.entries(CRP)) for (const g of [].concat(f)) { const i = hdr.findIndex(g); if (i >= 0) { cols[k] = i; break; } }
      if (!REQ_CRP.every(k => k in cols)) continue;
      const out = [];
      for (let i = h + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || !r.length) continue;
        const g = k => k in cols ? r[cols[k]] : '';
        const nocomp = txt(g('nocomp')).trim(); if (!nocomp) continue;
        const e = parseInt(txt(g('ejercicio')), 10) || 0;
        const fondo = txt(g('fondo')).trim();
        const llave = llaveCRP(nocomp);
        const vcrp = num(g('vcrp')), anul = num(g('anul'));
        const neto = 'neto' in cols ? num(g('neto')) : vcrp - anul, giro = num(g('giro'));
        out.push({
          fila: i + 1, ejercicio: e, fecha: fecha(g('fecha')), nocomp, llave, parecida: llave ? '' : llaveParecida(nocomp), rb: /^RB/i.test(fondo), fondo,
          objeto: txt(g('objeto')).trim(), crp: txt(g('crp')).trim(), benef: txt(g('benef')).trim(), docBenef: txt(g('docBenef')).replace(/\D/g, ''),
          vcrp, anul, neto, giro, sinaut: 'sinaut' in cols ? num(g('sinaut')) : neto - giro
        });
      }
      return { headerRow: h + 1, cols, filas: out };
    }
    throw new Error('No encontré las columnas del Reporte CRP. Se necesitan: No. Compromiso y Autorización giro.');
  }

  // ---------- Cruce ----------
  // ¿El beneficiario del CRP es el contratista de la Base? Documento si ambos lo traen; si no, nombre.
  const VACIAS = new Set(['SAS', 'LTDA', 'DEL', 'LOS', 'LAS', 'ESP']);
  const palabras = s => new Set(norm(s) ? String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/[^A-Z0-9]+/).filter(w => w.length > 2 && !VACIAS.has(w)) : []);
  function mismoTercero(f, regs) {
    const doc = f.doc.replace(/\D/g, '');
    const conDoc = regs.filter(r => r.docBenef);
    if (doc && conDoc.length) return conDoc.some(r => r.docBenef.endsWith(doc) || doc.endsWith(r.docBenef)) ? 'si' : 'no';
    const nb = palabras(f.nombre); if (!nb.size) return '';
    const benef = [...new Set(regs.map(r => r.benef).filter(Boolean))]; if (!benef.length) return '';
    return benef.some(b => { const pb = palabras(b); let k = 0; for (const w of nb) if (pb.has(w)) k++; return k >= Math.min(2, nb.size); }) ? 'si' : 'no';
  }

  function cruzar(base, crp) {
    const porLlave = new Map();
    const parecidas = new Map();
    for (const r of crp.filas) {
      if (r.parecida) (parecidas.get(r.parecida) || parecidas.set(r.parecida, []).get(r.parecida)).push(r);
      if (!r.llave) continue; (porLlave.get(r.llave) || porLlave.set(r.llave, []).get(r.llave)).push(r);
    }
    const fechas = crp.filas.map(r => r.fecha).filter(Boolean);
    const corte = fechas.length ? new Date(Math.max(...fechas.map(d => d.getTime()))) : null;
    const vistas = new Map(); // llave -> primera fila de la Base
    const s = (a, k) => a.reduce((t, r) => t + r[k], 0);
    const filas = base.filas.map(f => {
      const o = Object.assign({}, f, { estado: '', alertas: [], regs: [] });
      if (!f.llave) { o.estado = f.contrato ? 'sin-llave' : 'sin-contrato'; return o; }
      if (vistas.has(f.llave)) o.alertas.push('Contrato repetido en la Base (también en la fila ' + vistas.get(f.llave) + '): no sume la columna dos veces');
      else vistas.set(f.llave, f.row);
      const regs = porLlave.get(f.llave) || [];
      for (const r of parecidas.get(f.llave) || []) o.alertas.push('No se suma el compromiso «' + r.nocomp + '» de ' + (r.benef || 'otro tercero') + ' (giro $ ' + Math.round(r.giro).toLocaleString('es-CO') + '): ' + (/RESOLUCI/i.test(r.objeto) ? 'es una resolución' : 'no tiene el formato de contrato') + ' con el mismo número, no este contrato');
      if (!regs.length) {
        o.estado = 'no-cruza';
        const sinLetra = f.llave.replace(/^(\d+)[A-Z]-/, '$1-');
        if (sinLetra !== f.llave && porLlave.has(sinLetra)) o.alertas.push('En el CRP existe ' + sinLetra + ' (sin letra). No se asume que sea el mismo contrato: revíselo en BogData');
        return o;
      }
      o.estado = 'ok'; o.regs = regs;
      o.vcrp = s(regs, 'vcrp'); o.anul = s(regs, 'anul'); o.neto = s(regs, 'neto'); o.giro = s(regs, 'giro'); o.sinaut = s(regs, 'sinaut');
      o.giroVA = s(regs.filter(r => !r.rb), 'giro'); o.giroRB = s(regs.filter(r => r.rb), 'giro');
      o.ncrp = new Set(regs.map(r => r.crp || r.fila)).size;
      o.beneficiario = [...new Set(regs.map(r => r.benef).filter(Boolean))].join(' / ');
      o.objeto = (regs.slice().sort((a, b) => b.vcrp - a.vcrp)[0] || {}).objeto || '';
      const fs = regs.map(r => r.fecha).filter(Boolean);
      o.ultimo = fs.length ? new Date(Math.max(...fs.map(d => d.getTime()))) : null;
      o.tercero = mismoTercero(f, regs);
      if (o.tercero === 'no') o.alertas.push('El beneficiario del CRP (' + o.beneficiario + ') no es el contratista de la Base: posible cesión o número de contrato errado');
      if (o.neto <= TOL && o.vcrp > TOL) o.alertas.push('CRP anulado en su totalidad');
      if (o.giro - o.neto > TOL) o.alertas.push('Lo girado supera el valor neto del CRP');
      if (f.previo != null && Math.abs(f.previo - o.giro) > TOL) o.alertas.push('La Base traía $ ' + Math.round(f.previo).toLocaleString('es-CO') + ' en la columna de pagos');
      return o;
    });
    // CRP de la vigencia que no están en la Base (otros tipos de contrato, convenios, o contratos faltantes)
    const enBase = new Set(base.filas.map(f => f.llave).filter(Boolean));
    const vig = base.vigencia;
    const fuera = [];
    for (const [llave, regs] of porLlave) {
      if (enBase.has(llave) || !llave.endsWith('-' + vig) || regs.every(r => r.rb)) continue;
      fuera.push({ llave, regs, vcrp: s(regs, 'vcrp'), neto: s(regs, 'neto'), giro: s(regs, 'giro'), beneficiario: [...new Set(regs.map(r => r.benef).filter(Boolean))].join(' / '), objeto: (regs[0] || {}).objeto || '' });
    }
    fuera.sort((a, b) => parseInt(a.llave) - parseInt(b.llave) || a.llave.localeCompare(b.llave));
    const ok = filas.filter(f => f.estado === 'ok');
    const unicos = ok.filter(f => vistas.get(f.llave) === f.row);
    const tot = k => unicos.reduce((t, f) => t + (f[k] || 0), 0);
    const cuenta = e => filas.filter(f => f.estado === e).length;
    // Por tipo de persona (natural / jurídica)
    const porPersona = {};
    for (const f of unicos) { const k = f.persona || 'Sin dato'; const p = porPersona[k] = porPersona[k] || { tipo: k, n: 0, neto: 0, giro: 0 }; p.n++; p.neto += f.neto; p.giro += f.giro; }
    return {
      corte, vigencia: vig, filas, fuera, porPersona: Object.values(porPersona).sort((a, b) => b.n - a.n),
      total: { contratos: filas.filter(f => f.llave).length, cruzados: unicos.length, vcrp: tot('vcrp'), anul: tot('anul'), neto: tot('neto'), giro: tot('giro'), sinaut: tot('sinaut') },
      conteo: { filas: filas.length, ok: ok.length, noCruza: cuenta('no-cruza'), sinLlave: cuenta('sin-llave'), sinContrato: cuenta('sin-contrato'), conAlertas: filas.filter(f => f.alertas.length).length, sinGiro: ok.filter(f => f.giro <= TOL).length },
      registrosCRP: crp.filas.length
    };
  }

  // ---------- Escritura en la Base (solo la columna de pagos; el resto del archivo no se toca) ----------
  const colLetra = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
  const colIndice = l => { let n = 0; for (const ch of l) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const escXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // Map(fila -> valor | null). Contratos que no cruzan quedan vacíos, como en la macro.
  function plan(base, res) {
    const m = new Map();
    for (const f of res.filas) m.set(f.row, f.estado === 'ok' ? Math.round(f.giro) : null);
    return { letra: colLetra(base.cols.valor), valores: m };
  }

  function parcharHoja(xml, p) {
    const reFila = /<row\b[^>]*\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
    const reCelda = /<c\b[^>]*?\br="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let celdas = 0, estiloRef = '';
    const salida = xml.replace(reFila, (fila, rn, cuerpo) => {
      const r = +rn; if (!p.valores.has(r)) return fila;
      const v = p.valores.get(r);
      const apertura = fila.slice(0, fila.indexOf('>') + 1).replace(/\/>$/, '>');
      const lista = []; let hay = false;
      (cuerpo || '').replace(reCelda, (c, col, _r, attrs) => {
        if (col === p.letra) {
          hay = true;
          const s = (/\bs="(\d+)"/.exec(attrs) || [])[1] || ''; if (s && !estiloRef) estiloRef = s;
          lista.push({ i: colIndice(col), xml: celda(col + r, s, v) });
        } else lista.push({ i: colIndice(col), xml: c });
        return c;
      });
      if (!hay) lista.push({ i: colIndice(p.letra), xml: celda(p.letra + r, estiloRef, v) });
      lista.sort((a, b) => a.i - b.i);
      celdas++;
      return apertura + lista.map(x => x.xml).join('') + '</row>';
    });
    return { xml: salida, celdas };
  }
  const celda = (ref, s, v) => { const st = s ? ` s="${s}"` : ''; return v == null ? `<c r="${ref}"${st}/>` : `<c r="${ref}"${st}><v>${v}</v></c>`; };

  async function diligenciar(zip, base, res, nombreHoja) {
    const leer = p => zip.file(p) ? zip.file(p).async('string') : Promise.resolve(null);
    const wbXml = await leer('xl/workbook.xml'), rels = await leer('xl/_rels/workbook.xml.rels');
    if (!wbXml || !rels) throw new Error('La Base no es un .xlsx válido.');
    const hojas = [...wbXml.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].map(m => ({ nombre: m[1].replace(/&amp;/g, '&'), id: m[2] }));
    const hoja = hojas.find(h => h.nombre === nombreHoja) || hojas[0];
    const destino = (new RegExp(`<Relationship\\b[^>]*Id="${hoja.id}"[^>]*Target="([^"]+)"`).exec(rels) || new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${hoja.id}"`).exec(rels) || [])[1];
    if (!destino) throw new Error('No encontré la hoja «' + hoja.nombre + '» dentro del archivo.');
    const ruta = 'xl/' + destino.replace(/^\/?xl\//, '').replace(/^\//, '');
    const { xml, celdas } = parcharHoja(await leer(ruta), plan(base, res));
    zip.file(ruta, xml);
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml');
      zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/g, ''));
      const ct = await leer('[Content_Types].xml');
      if (ct) zip.file('[Content_Types].xml', ct.replace(/<Override\b[^>]*calcChain[^>]*\/>/g, ''));
    }
    return { celdas, hoja: hoja.nombre };
  }

  const api = { llaveBase, llaveCRP, llaveParecida, leerBase, leerCRP, cruzar, plan, parcharHoja, diligenciar, colLetra, fecha, iso, norm };
  if (typeof module !== 'undefined') module.exports = api; else root.MotorPagos = api;
})(typeof window !== 'undefined' ? window : globalThis);
