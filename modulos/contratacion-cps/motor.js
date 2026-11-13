// Motor de cálculo: Informe de contratación CPS (profesionales / apoyo a la gestión)
// a partir del Reporte CRP histórico de BogData. Funciona en navegador y en Node.
(function (root) {
  const P = 'CONTRATO DE PRESTACION DE SERVICIOS PROFESIONALES';
  const A = 'CONTRATO DE PRESTACION DE SERVICIOS DE APOYO A LA GESTION';
  const G = 'CONTRATO DE PRESTACION DE SERVICIOS';
  const PROF = 'Profesionales', APO = 'Apoyo a la gestión', SIN = 'Sin clasificar';

  const COLS = {
    ejercicio: 'Ejercicio', fecha: 'Fecha Registro', compromiso: 'Compromiso',
    nocomp: 'No. Compromiso', cdp: 'Número de CDP', crp: 'Número de CRP', objeto: 'Objeto',
    rubro: 'Descripción del Rubro', fondo: 'Descripcion del Fondo', modsel: 'Descripcion Mod. Selec',
    tipodoc: 'Tipo Doc. BP Beneficiario', benef: 'Nombre BP Beneficiario',
    vcrp: 'Valor CRP', anul: 'Anulaciones', reint: 'Reintegros', neto: 'Valor Neto', giro: 'Autorizacion giro'
  };

  const EQUIV = [
    [/COORDINAR LA ARTICULACI/, PROF],
    [/COORDINA, LIDERA Y ASESORA|COORDINAR, LIDERAR Y ASESORAR|COORDINA  LIDERA/, PROF],
    [/LIDERAR Y GARANTIZAR LA IMPLEMENTACI/, PROF],
    [/ORIENTADOS AL DEPORTE/, APO],
    [/MAESTRO DE OBRA/, APO]
  ];

  const norm = s => String(s == null ? '' : s).trim().toLowerCase();
  const num = v => { if (typeof v === 'number') return v; const n = parseFloat(String(v || '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
  const str = v => v == null ? '' : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

  // rows: array of arrays (primera fila con encabezados en las primeras 25)
  function mapColumns(rows) {
    for (let h = 0; h < Math.min(25, rows.length); h++) {
      const hdr = (rows[h] || []).map(norm);
      const idx = {}; let ok = true;
      for (const [k, name] of Object.entries(COLS)) {
        const i = hdr.indexOf(norm(name));
        if (i < 0) { if (['ejercicio', 'compromiso', 'nocomp', 'objeto', 'fondo', 'neto'].includes(k)) ok = false; }
        idx[k] = i;
      }
      if (ok) return { headerRow: h, idx };
    }
    const faltan = ['Ejercicio', 'Compromiso', 'No. Compromiso', 'Objeto', 'Descripcion del Fondo', 'Valor Neto'];
    throw new Error('No encontré las columnas del Reporte CRP. Se necesitan: ' + faltan.join(', '));
  }

  function vigencia(nocomp, objeto, e) {
    const ok = y => y === e || y === e - 1 || y === e - 2;
    let m = /[-\s](20[12]\d)/.exec(nocomp);
    if (m && ok(+m[1])) return [+m[1], 'No. Compromiso'];
    m = /\d{2,4}\s*-\s*(20[12]\d)/.exec(objeto);
    if (m && ok(+m[1])) return [+m[1], 'Objeto'];
    return [e, 'Ejercicio'];
  }

  function procesar(rows, opts = {}) {
    const { headerRow, idx } = mapColumns(rows);
    const g = (r, k) => idx[k] >= 0 ? r[idx[k]] : '';
    const all = [];
    for (let i = headerRow + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r || !r.length) continue;
      const e = parseInt(str(g(r, 'ejercicio')), 10); if (!e) continue;
      const nocomp = str(g(r, 'nocomp')), objeto = str(g(r, 'objeto'));
      const [vig, fuente] = vigencia(nocomp, objeto, e);
      const m = /^\s*0*(\d{1,4})/.exec(nocomp);
      const clave = (m ? m[1] : nocomp) + '-' + vig;
      all.push({
        ejercicio: e, vig, fuente, clave, nocomp, objeto,
        compromiso: str(g(r, 'compromiso')), fondo: str(g(r, 'fondo')), modsel: str(g(r, 'modsel')),
        tipodoc: str(g(r, 'tipodoc')), benef: str(g(r, 'benef')), fecha: str(g(r, 'fecha')),
        cdp: str(g(r, 'cdp')), crp: str(g(r, 'crp')), rubro: str(g(r, 'rubro')),
        vcrp: num(g(r, 'vcrp')), anul: num(g(r, 'anul')), reint: num(g(r, 'reint')), neto: num(g(r, 'neto')), giro: num(g(r, 'giro')),
        tipoFila: '', metodo: ''
      });
    }
    // 1) tipo explícito en columna H
    const votos = {};
    for (const x of all) {
      if (x.compromiso === P || x.compromiso === A) {
        x.tipoFila = x.compromiso === P ? PROF : APO; x.metodo = 'Columna H';
        (votos[x.clave] = votos[x.clave] || { [PROF]: 0, [APO]: 0 })[x.tipoFila]++;
      }
    }
    const moda = k => { const v = votos[k]; if (!v) return null; return v[APO] >= v[PROF] ? APO : PROF; };
    // 2) tipo genérico: persona natural, contratación directa
    for (const x of all) {
      if (x.compromiso !== G || x.modsel !== 'CONTRATACIÓN DIRECTA' || x.tipodoc === 'NIT') continue;
      const s = x.objeto.toUpperCase();
      let t = '', mt = '';
      if (/ARRENDAMIENTO/.test(s)) { t = ''; mt = ''; }
      else if (/CPS\s*-?\s*AG/.test(s)) { t = APO; mt = 'Código CPS-AG en objeto'; }
      else if (/CPS\s*-?\s*P\b/.test(s)) { t = PROF; mt = 'Código CPS-P en objeto'; }
      else if (moda(x.clave)) { t = moda(x.clave); mt = 'Heredado del contrato'; }
      else if (/PROFESIONAL|POFESIONAL|PROFESIONA/.test(s)) { t = PROF; mt = 'Texto del objeto'; }
      else if (/APOY|T[EÉ]CNIC|ASISTENCIAL|AUXILIAR|CONDUC|OPERARIO|SABEDOR|INSPECTOR/.test(s)) { t = APO; mt = 'Texto del objeto'; }
      else {
        const eq = EQUIV.find(([re]) => re.test(s));
        if (eq) { t = eq[1]; mt = 'Objeto igual a contratos de col. H'; } else { t = SIN; mt = 'Sin clasificar'; }
      }
      x.tipoFila = t; x.metodo = mt;
    }
    const vMin = opts.desde || 2021, vMax = opts.hasta || 2026;
    const incluirOxP = !!opts.incluirOxP;
    const sel = all.filter(x => x.tipoFila && x.vig >= vMin && x.vig <= vMax && (incluirOxP ? true : x.fondo.toUpperCase().startsWith('VA')));
    // 3) agrupar por contrato: tipo = el de su CRP de mayor valor neto
    const contratos = new Map();
    for (const x of sel) {
      const k = x.vig + '|' + x.clave;
      let c = contratos.get(k);
      if (!c) { c = { k, vig: x.vig, clave: x.clave, filas: [], tot: 0, max: -Infinity, tipo: '', benef: x.benef }; contratos.set(k, c); }
      c.filas.push(x); c.tot += x.neto;
      if (x.neto > c.max) { c.max = x.neto; c.tipo = x.tipoFila; c.benef = x.benef; }
    }
    for (const c of contratos.values()) for (const x of c.filas) x.tipo = c.tipo;
    // 4) cuadro
    const tipos = [PROF, APO, SIN];
    const cuadro = [];
    for (let y = vMin; y <= vMax; y++) for (const t of tipos) cuadro.push({ vig: y, tipo: t, n: 0, vcrp: 0, anul: 0, neto: 0, giro: 0 });
    const cel = (y, t) => cuadro[(y - vMin) * 3 + tipos.indexOf(t)];
    for (const c of contratos.values()) if (c.tot > 0) cel(c.vig, c.tipo).n++;
    for (const x of sel) { const z = cel(x.vig, x.tipo); z.vcrp += x.vcrp; z.anul += x.anul; z.neto += x.neto; z.giro += x.giro; }
    const metodos = {};
    for (const x of sel) { metodos[x.metodo] = metodos[x.metodo] || { filas: 0, neto: 0 }; metodos[x.metodo].filas++; metodos[x.metodo].neto += x.neto; }
    const excluidas = all.filter(x => x.tipoFila && x.vig >= vMin && x.vig <= vMax && !x.fondo.toUpperCase().startsWith('VA'));
    return {
      totalFilas: all.length, ejercicios: [...new Set(all.map(x => x.ejercicio))].sort(),
      desde: vMin, hasta: vMax, incluirOxP, detalle: sel, contratos: [...contratos.values()], cuadro, metodos,
      oxp: { filas: excluidas.length, neto: excluidas.reduce((s, x) => s + x.neto, 0) }
    };
  }

  const api = { procesar, PROF, APO, SIN };
  if (typeof module !== 'undefined') module.exports = api; else root.MotorCPS = api;
})(typeof window !== 'undefined' ? window : globalThis);
