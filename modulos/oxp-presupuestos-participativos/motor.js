// Motor de cálculo: Matriz de Obligaciones por Pagar (OXP) de iniciativas de Presupuestos
// Participativos, a partir del Reporte CRP histórico de BogData. Funciona en navegador y en Node.
//
// Regla central: el mismo dinero aparece varias veces en el reporte. El CRP de la vigencia
// (fondo VA) se vuelve a registrar al año siguiente como obligación por pagar (fondo RB), y lo que
// no se gira se registra otra vez el año después. Por eso:
//   CRP y OXP constituida  -> solo registros VA del año del contrato
//   Giros y liberaciones    -> solo registros RB (años siguientes)
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
  const serial = d => Math.round((d.getTime() - Date.UTC(1899, 11, 30)) / 864e5);
  const iso = d => d ? d.toISOString().slice(0, 10) : '';

  // ---------- Llave de contrato ----------
  // Número de contrato de la matriz -> "NNN-AAAA" (sin ceros a la izquierda).
  function llaveMatriz(valor, vigIniciativa) {
    let s = txt(valor).replace(/["“”]/g, '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return { llave: '', motivo: 'Sin número de contrato' };
    if (!/\d/.test(s)) return { llave: '', motivo: 'Sin número de contrato: «' + s + '»' };
    const sinPar = s.replace(/\([^)]*\)?/g, ' ');           // quita códigos entre paréntesis
    const re = /(?:^|[^\d])(\d{1,4})\s*(?:-|\s+de\s+)\s*(20[12]\d)/i;
    let m = re.exec(sinPar), nota = '';
    if (m) {
      const tras = sinPar.slice(m.index + m[0].length);
      if (/^\d/.test(tras)) nota = 'Año con dígito de más corregido';
      const otros = (sinPar.slice(m.index + m[0].length).match(/(?:^|[^\d])\d{1,4}\s*-\s*20[12]\d/g) || []).length;
      if (otros) nota = (nota ? nota + '; ' : '') + 'Varios contratos en la celda: se toma el primero';
      return { llave: (+m[1]) + '-' + m[2], motivo: nota };
    }
    m = /(?:^|[^\d])(\d{1,4})(?!\d)/.exec(sinPar);
    if (m && /^20[12]\d$/.test(m[1])) return { llave: '', motivo: 'Sin número de contrato: «' + s + '»' };
    const y = parseInt(vigIniciativa, 10);
    if (m && y) return { llave: (+m[1]) + '-' + y, motivo: 'Sin año en el número: se toma la vigencia de la iniciativa' };
    return { llave: '', motivo: 'No se reconoce el número de contrato: «' + s + '»' };
  }
  // No. Compromiso del reporte CRP -> llave. 657-20231 y 657-2023 son el mismo contrato.
  function llaveCRP(nocomp, objeto, ejercicio) {
    const s = txt(nocomp).trim();
    const m = /^\D*0*(\d{1,4})\s*-\s*(20[12]\d)/.exec(s);
    if (m) return { llave: (+m[1]) + '-' + m[2], fuente: 'No. Compromiso' };
    const n = /^\D*0*(\d{1,4})(?!\d)/.exec(s);
    if (!n) return { llave: '', fuente: '' };
    const o = /(?:^|[^\d])0*(\d{1,4})\s*(?:-|\s+de\s+)\s*(20[12]\d)/i.exec(txt(objeto));
    if (o && +o[1] === +n[1] && +o[2] <= ejercicio && +o[2] >= ejercicio - 4) return { llave: (+n[1]) + '-' + o[2], fuente: 'Objeto' };
    return { llave: (+n[1]) + '-' + ejercicio, fuente: 'Ejercicio' };
  }

  // ---------- Lectura ----------
  const MATRIZ = {
    contrato: h => h === 'NUMEROCONTRATO', vigIni: h => h.startsWith('VIGENCIAINICIATIVA'),
    idIni: h => h.startsWith('IDINICIATIVA'), nombre: h => h.startsWith('NOMBRETITULO'),
    tramite: h => h.startsWith('TRAMITECONTRACTUAL'), localidad: h => h === 'LOCALIDAD',
    llaveExistente: h => h === 'COLUMNA1' || h.startsWith('NUMEROCONTRATOESTANDARIZADO'),
    anio: h => h.startsWith('ANOSUSCRIPCION'), objeto: h => h.startsWith('OBJETOCONTRACTUAL'),
    cdp: h => h.startsWith('VALORCDP'), crp: h => h.startsWith('VALORCRP'),
    vigoxp: h => h.startsWith('VIGENCIAOXP'), oxp: h => h.startsWith('OXPCONSTITUIDA'),
    giros: h => h.startsWith('GIROSOXP'), fcorte: h => h.startsWith('FECHACORTEDEGIROS'),
    tipoanul: h => h.startsWith('TIPODEANULACION'), lib: h => h.startsWith('MONTOLIBERACION'),
    saldo: h => h.startsWith('SALDOOXP'), estado: h => h.startsWith('ESTADOACTUALOXP')
  };
  const REQ_MATRIZ = ['contrato', 'vigIni', 'crp', 'oxp', 'giros', 'lib', 'saldo', 'estado'];
  const NOMBRES = { contrato: 'NÚMERO CONTRATO', vigIni: 'VIGENCIA INICIATIVA', crp: 'VALOR CRP ($)', oxp: 'OXP CONSTITUIDA 31/12 ($)', giros: 'GIROS OXP AÑO SIGUIENTE ($)', lib: 'MONTO LIBERACIÓN / FENECIMIENTO ($)', saldo: 'SALDO OXP AL CORTE ($)', estado: 'ESTADO ACTUAL OXP' };

  function leerMatriz(rows) {
    for (let h = 0; h < Math.min(30, rows.length); h++) {
      const hdr = (rows[h] || []).map(norm), cols = {};
      for (const [k, f] of Object.entries(MATRIZ)) { const i = hdr.findIndex(f); if (i >= 0) cols[k] = i; }
      if (!REQ_MATRIZ.every(k => k in cols)) continue;
      const filas = [];
      for (let i = h + 1; i < rows.length; i++) {
        const r = rows[i] || [], g = k => k in cols ? r[cols[k]] : '';
        const vig = parseInt(txt(g('vigIni')), 10);
        if (!vig && !txt(g('contrato')).trim() && !txt(g('idIni')).trim()) continue;
        const { llave, motivo } = llaveMatriz(g('contrato'), vig);
        filas.push({
          row: i + 1, vig, idIni: txt(g('idIni')).trim(), nombre: txt(g('nombre')).trim(), tramite: txt(g('tramite')).trim(),
          contrato: txt(g('contrato')).replace(/\s+/g, ' ').trim(), llave, motivo,
          llaveExistente: 'llaveExistente' in cols ? txt(g('llaveExistente')).trim() : '',
          objetoActual: txt(g('objeto')).trim(),
          previo: { crp: num(g('crp')), oxp: num(g('oxp')), giros: num(g('giros')), lib: num(g('lib')), saldo: num(g('saldo')) },
          tienePrevio: ['crp', 'oxp', 'giros', 'lib'].some(k => txt(g(k)).trim() !== '')
        });
      }
      return { headerRow: h + 1, cols, filas, headers: (rows[h] || []).map(x => txt(x)) };
    }
    const faltan = REQ_MATRIZ.map(k => NOMBRES[k]);
    throw new Error('No encontré la hoja de la matriz OXP. Se necesitan las columnas: ' + faltan.join(', '));
  }

  const CRP = {
    ejercicio: h => h === 'EJERCICIO', fecha: h => h === 'FECHAREGISTRO', nocomp: h => h === 'NOCOMPROMISO',
    objeto: h => h === 'OBJETO', fondo: h => h === 'DESCRIPCIONDELFONDO', crp: h => h === 'NUMERODECRP',
    vcrp: h => h === 'VALORCRP', anul: h => h === 'ANULACIONES', neto: h => h === 'VALORNETO',
    giro: h => h === 'AUTORIZACIONGIRO', sinaut: h => h.includes('SINAUT'), benef: h => h === 'NOMBREBPBENEFICIARIO'
  };
  const REQ_CRP = ['ejercicio', 'fecha', 'nocomp', 'fondo', 'vcrp', 'anul', 'giro'];
  const NOMBRES_CRP = { ejercicio: 'Ejercicio', fecha: 'Fecha Registro', nocomp: 'No. Compromiso', fondo: 'Descripcion del Fondo', vcrp: 'Valor CRP', anul: 'Anulaciones', giro: 'Autorizacion giro' };

  function leerCRP(rows) {
    for (let h = 0; h < Math.min(25, rows.length); h++) {
      const hdr = (rows[h] || []).map(norm), cols = {};
      for (const [k, f] of Object.entries(CRP)) { const i = hdr.findIndex(f); if (i >= 0) cols[k] = i; }
      if (!REQ_CRP.every(k => k in cols)) continue;
      const out = [];
      for (let i = h + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r || !r.length) continue;
        const g = k => k in cols ? r[cols[k]] : '';
        const e = parseInt(txt(g('ejercicio')), 10); if (!e) continue;
        const fondo = txt(g('fondo')).trim(), objeto = txt(g('objeto'));
        const { llave, fuente } = llaveCRP(g('nocomp'), objeto, e);
        const neto = 'neto' in cols ? num(g('neto')) : num(g('vcrp')) - num(g('anul'));
        const giro = num(g('giro'));
        out.push({
          fila: i + 1, ejercicio: e, fecha: fecha(g('fecha')), nocomp: txt(g('nocomp')).trim(), llave, fuenteLlave: fuente,
          rb: /^RB/i.test(fondo), fondo, objeto: objeto.trim(), crp: txt(g('crp')), benef: txt(g('benef')).trim(),
          vcrp: num(g('vcrp')), anul: num(g('anul')), neto, giro,
          sinaut: 'sinaut' in cols ? num(g('sinaut')) : neto - giro
        });
      }
      return { headerRow: h + 1, cols, filas: out, tieneSinAut: 'sinaut' in cols };
    }
    throw new Error('No encontré las columnas del Reporte CRP. Se necesitan: ' + REQ_CRP.map(k => NOMBRES_CRP[k]).join(', '));
  }

  // ---------- Cruce ----------
  function calcularContrato(llave, regs, maxEj) {
    const anio = +llave.split('-')[1];
    const va = regs.filter(r => !r.rb), rb = regs.filter(r => r.rb);
    const vaAnio = va.filter(r => r.ejercicio === anio);
    const s = (a, k) => a.reduce((t, r) => t + r[k], 0);
    const c = { llave, anio, regs, alertas: [] };
    c.crp = s(vaAnio, 'vcrp');
    c.anulVA = s(vaAnio, 'anul');
    // La OXP se constituye al cierre (31/12): si la vigencia del contrato no ha cerrado, aún no hay OXP
    c.abierta = anio >= maxEj;
    c.oxp = c.abierta ? 0 : Math.max(0, s(vaAnio, 'sinaut'));
    c.giros = s(rb, 'giro');
    c.anulRB = s(rb, 'anul');
    const ejRB = rb.length ? Math.max(...rb.map(r => r.ejercicio)) : 0;
    c.ultimoEjRB = ejRB;
    const pendUltimo = s(rb.filter(r => r.ejercicio === ejRB), 'sinaut');
    // Lo que quedó sin girar en el último año de reserva, si ese año ya cerró y no se volvió a registrar
    c.fenecido = ejRB && ejRB < maxEj && pendUltimo > TOL ? pendUltimo : 0;
    c.pendiente = ejRB === maxEj ? Math.max(0, pendUltimo) : 0;
    c.lib = c.anulRB + c.fenecido;
    c.saldo = c.oxp - c.giros - c.lib;
    const fechas = regs.map(r => r.fecha).filter(Boolean);
    c.fcorte = fechas.length ? new Date(Math.max(...fechas.map(d => d.getTime()))) : null;
    c.objeto = (vaAnio.slice().sort((a, b) => b.vcrp - a.vcrp)[0] || va[0] || regs[0] || {}).objeto || '';
    c.tipoanul = c.lib <= TOL ? 'No aplica' : (c.fenecido && c.anulRB > TOL ? 'Por validar' : c.fenecido ? 'Fenecimiento' : 'Liberación');
    if (c.oxp <= TOL) c.estado = 'Sin OXP constituida';
    else if (c.saldo > TOL) c.estado = c.giros > TOL ? 'Girada parcialmente' : 'Con saldo pendiente';
    else if (c.fenecido > TOL) c.estado = 'Fenecida';
    else if (c.giros <= TOL) c.estado = 'Liberada';
    else c.estado = 'Girada totalmente';
    // Alertas
    if (c.abierta) c.alertas.push('La vigencia ' + anio + ' no ha cerrado en el reporte: todavía no hay OXP constituida');
    if (!vaAnio.length) c.alertas.push('Sin CRP de la vigencia ' + anio + ' (fondo VA)');
    const otrosVA = [...new Set(va.filter(r => r.ejercicio !== anio).map(r => r.ejercicio))];
    if (otrosVA.length) c.alertas.push('Tiene CRP de vigencia en ' + otrosVA.join(', ') + ' (adición u otro contrato con el mismo número): no se suman a la OXP ' + anio);
    if (c.oxp > TOL && !rb.length) c.alertas.push('Tiene OXP pero no aparecen registros RB de obligaciones por pagar');
    if (Math.abs(c.saldo - c.pendiente) > TOL) c.alertas.push('El saldo calculado ($ ' + Math.round(c.saldo).toLocaleString('es-CO') + ') no coincide con lo pendiente de giro en el reporte ($ ' + Math.round(c.pendiente).toLocaleString('es-CO') + ')');
    if (c.saldo < -TOL) c.alertas.push('Saldo negativo: los giros y liberaciones superan la OXP');
    if (regs.some(r => r.fuenteLlave === 'Ejercicio')) c.alertas.push('Algún registro no trae el año en el No. Compromiso: se asignó por el ejercicio');
    return c;
  }

  function cruzar(matriz, crp) {
    const maxEj = Math.max(...crp.filas.map(r => r.ejercicio));
    const porLlave = new Map();
    for (const r of crp.filas) { if (!r.llave) continue; (porLlave.get(r.llave) || porLlave.set(r.llave, []).get(r.llave)).push(r); }
    const contratos = new Map();
    const filas = matriz.filas.map(f => {
      const out = Object.assign({}, f, { estadoCruce: '', c: null });
      if (!f.llave) { out.estadoCruce = f.contrato ? 'sin-llave' : 'sin-contrato'; return out; }
      const regs = porLlave.get(f.llave);
      if (!regs) { out.estadoCruce = 'no-cruza'; return out; }
      let c = contratos.get(f.llave);
      if (!c) { c = calcularContrato(f.llave, regs, maxEj); c.iniciativas = []; contratos.set(f.llave, c); }
      c.iniciativas.push(f);
      out.c = c; out.estadoCruce = 'ok';
      return out;
    });
    const lista = [...contratos.values()].sort((a, b) => a.anio - b.anio || parseInt(a.llave) - parseInt(b.llave));
    // Resumen por vigencia OXP (cada contrato una sola vez)
    const vig = {};
    for (const c of lista) {
      const v = vig[c.anio] = vig[c.anio] || { anio: c.anio, n: 0, ini: 0, crp: 0, oxp: 0, giros: 0, lib: 0, saldo: 0 };
      v.n++; v.ini += c.iniciativas.length; for (const k of ['crp', 'oxp', 'giros', 'lib', 'saldo']) v[k] += c[k];
    }
    const cuenta = e => filas.filter(f => f.estadoCruce === e).length;
    const cambios = filas.filter(f => f.c && f.tienePrevio && ['crp', 'oxp', 'giros', 'lib'].some(k => Math.abs(f.previo[k] - f.c[k]) > TOL)).length;
    const canon = s => norm(String(s).replace(/^0+(\d)/, '$1'));
    for (const f of filas) f.llaveDifiere = !!(f.llaveExistente && f.llave && canon(f.llaveExistente) !== canon(f.llave));
    const llaveDistinta = filas.filter(f => f.llaveDifiere).length;
    return {
      maxEj, filas, contratos: lista, vigencias: Object.values(vig).sort((a, b) => a.anio - b.anio),
      conteo: { iniciativas: filas.length, conContrato: filas.filter(f => f.llave || f.contrato).length, ok: cuenta('ok'), noCruza: cuenta('no-cruza'), sinLlave: cuenta('sin-llave'), sinContrato: cuenta('sin-contrato'), cambios, llaveDistinta, conAlertas: lista.filter(c => c.alertas.length).length },
      registrosCRP: crp.filas.length, tieneSinAut: crp.tieneSinAut
    };
  }

  // ---------- Escritura en la plantilla (XML de la hoja, sin tocar lo demás) ----------
  const colLetra = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
  const colIndice = l => { let n = 0; for (const ch of l) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const escXml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const CALCULADAS = ['anio', 'crp', 'vigoxp', 'oxp', 'giros', 'fcorte', 'tipoanul', 'lib', 'saldo', 'estado'];

  // Devuelve { celdas: Map(fila -> Map(letra -> contenido)), columnas: [letras], nombres: [encabezados] }
  function plan(matriz, res) {
    const L = {}; for (const k of [...CALCULADAS, 'objeto']) if (k in matriz.cols) L[k] = colLetra(matriz.cols[k]);
    const fSaldo = r => `IF(${L.oxp}${r}="","",${L.oxp}${r}-IF(${L.giros}${r}="",0,${L.giros}${r})-IF(${L.lib}${r}="",0,${L.lib}${r}))`;
    const celdas = new Map();
    const primera = matriz.headerRow + 1, ultima = Math.max(primera, ...matriz.filas.map(f => f.row));
    const porFila = new Map(res.filas.map(f => [f.row, f]));
    for (let r = primera; r <= ultima; r++) {
      const f = porFila.get(r), m = new Map(); celdas.set(r, m);
      const c = f && f.c;
      const val = (k, v) => { if (L[k]) m.set(L[k], v); };
      if (c) {
        val('anio', { n: c.anio }); val('crp', { n: Math.round(c.crp) }); val('vigoxp', { n: c.anio });
        val('oxp', { n: Math.round(c.oxp) }); val('giros', { n: Math.round(c.giros) });
        val('fcorte', c.fcorte ? { n: serial(c.fcorte) } : {}); val('tipoanul', { s: c.tipoanul });
        val('lib', { n: Math.round(c.lib) }); val('saldo', { f: fSaldo(r), n: Math.round(c.oxp) - Math.round(c.giros) - Math.round(c.lib) });
        val('estado', { s: c.estado });
        if (L.objeto && !f.objetoActual && c.objeto) m.set(L.objeto, { s: c.objeto.slice(0, 32000) });
      } else if (f && f.estadoCruce !== 'sin-contrato') {
        for (const k of CALCULADAS) val(k, {});
        val('saldo', { f: fSaldo(r), str: '' }); val('estado', { s: 'Por validar' });
      } else {
        for (const k of CALCULADAS) val(k, {});
        val('saldo', { f: fSaldo(r), str: '' });
      }
    }
    const columnas = CALCULADAS.filter(k => L[k]).map(k => L[k]);
    return { celdas, columnas, primera, ultima };
  }

  function celdaXml(ref, s, v) {
    const st = s ? ` s="${s}"` : '';
    if (v.f != null) return v.str != null ? `<c r="${ref}"${st} t="str"><f>${escXml(v.f)}</f><v></v></c>` : `<c r="${ref}"${st}><f>${escXml(v.f)}</f><v>${v.n}</v></c>`;
    if (v.n != null) return `<c r="${ref}"${st}><v>${v.n}</v></c>`;
    if (v.s != null) return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${escXml(v.s)}</t></is></c>`;
    return `<c r="${ref}"${st}/>`;
  }

  function parcharHoja(xml, p) {
    const reFila = /<row\b[^>]*\br="(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
    const reCelda = /<c\b[^>]*?\br="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    const objetivo = new Set(p.columnas);
    const quitados = new Set(); // si de fórmulas compartidas cuyo maestro se reemplaza
    // 1) revisar fórmulas compartidas que salgan de las columnas reemplazadas
    xml.replace(reFila, (fila, rn, cuerpo) => {
      const r = +rn; if (!cuerpo || r < p.primera || r > p.ultima) return fila;
      cuerpo.replace(reCelda, (c, col, _r, attrs, cont) => {
        const m = cont && /<f\b[^>]*t="shared"[^>]*ref="([A-Z]+)\d+:([A-Z]+)\d+"[^>]*si="(\d+)"/.exec(cont);
        if (m && objetivo.has(col)) { if (m[1] !== col || m[2] !== col) throw new Error('La columna ' + col + ' tiene una fórmula compartida con otras columnas; no se puede escribir sin dañarla.'); quitados.add(m[3]); }
        return c;
      });
      return fila;
    });
    let hijosFuera = 0;
    xml.replace(reCelda, (c, col, r, attrs, cont) => {
      if (!cont) return c;
      const m = /<f\b[^>]*t="shared"[^>]*si="(\d+)"/.exec(cont);
      if (m && quitados.has(m[1]) && (!objetivo.has(col) || +r < p.primera || +r > p.ultima)) hijosFuera++;
      return c;
    });
    if (hijosFuera) throw new Error('Hay fórmulas compartidas fuera del rango de datos que dependen de las columnas calculadas.');
    // 2) reemplazar celdas
    const escritas = { celdas: 0, filas: 0 };
    const salida = xml.replace(reFila, (fila, rn, cuerpo) => {
      const r = +rn, cambios = p.celdas.get(r);
      if (!cambios || !cambios.size) return fila;
      const apertura = fila.slice(0, fila.indexOf('>') + 1).replace(/\/>$/, '>');
      const lista = [];
      (cuerpo || '').replace(reCelda, (c, col, _r, attrs) => {
        const s = (/\bs="(\d+)"/.exec(attrs) || [])[1] || '';
        lista.push({ col, i: colIndice(col), xml: cambios.has(col) ? celdaXml(col + r, s, cambios.get(col)) : c });
        return c;
      });
      const hay = new Set(lista.map(x => x.col));
      for (const [col, v] of cambios) if (!hay.has(col)) lista.push({ col, i: colIndice(col), xml: celdaXml(col + r, '', v) });
      lista.sort((a, b) => a.i - b.i);
      escritas.filas++; escritas.celdas += cambios.size;
      let ap = apertura;
      const sp = /\bspans="(\d+):(\d+)"/.exec(ap);
      if (sp) { const maxI = lista[lista.length - 1].i + 1; if (maxI > +sp[2]) ap = ap.replace(sp[0], `spans="${sp[1]}:${maxI}"`); }
      return ap + lista.map(x => x.xml).join('') + '</row>';
    });
    return { xml: salida, escritas };
  }

  // Quita fórmulas de columna calculada de la tabla para las columnas reemplazadas
  function parcharTabla(xml, encabezados) {
    const nombres = new Set(encabezados.map(norm));
    return xml.replace(/<tableColumn\b([^>]*?)(\/>|>([\s\S]*?)<\/tableColumn>)/g, (t, attrs, _c, cont) => {
      const nm = (/\bname="([^"]*)"/.exec(attrs) || [])[1] || '';
      const real = nm.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/_x000a_/gi, ' ');
      if (!cont || !nombres.has(norm(real))) return t;
      const limpio = cont.replace(/<calculatedColumnFormula\b[\s\S]*?<\/calculatedColumnFormula>/g, '').replace(/<calculatedColumnFormula\b[^>]*\/>/g, '');
      return limpio.trim() ? `<tableColumn${attrs}>${limpio}</tableColumn>` : `<tableColumn${attrs}/>`;
    });
  }
  // Fuerza a Excel a recalcular al abrir (la tabla puede tener fórmulas que dependen del CRP)
  function parcharLibro(xml) {
    if (/<calcPr\b/.test(xml)) return xml.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, a, cierre) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"${cierre}>`);
    return xml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  }

  // Lleva el proceso completo sobre un JSZip ya cargado con la matriz
  async function diligenciar(zip, matriz, res, nombreHoja) {
    const leer = p => zip.file(p) ? zip.file(p).async('string') : Promise.resolve(null);
    const wbXml = await leer('xl/workbook.xml'), rels = await leer('xl/_rels/workbook.xml.rels');
    if (!wbXml || !rels) throw new Error('El archivo de la matriz no es un .xlsx válido.');
    const hojas = [...wbXml.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)].map(m => ({ nombre: m[1].replace(/&amp;/g, '&'), id: m[2] }));
    const hoja = hojas.find(h => h.nombre === nombreHoja) || hojas.find(h => /OXP/i.test(h.nombre));
    if (!hoja) throw new Error('No encontré la hoja «MATRIZ OXP» en la matriz.');
    const destino = (new RegExp(`<Relationship\\b[^>]*Id="${hoja.id}"[^>]*Target="([^"]+)"`).exec(rels) || new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${hoja.id}"`).exec(rels) || [])[1];
    const ruta = 'xl/' + destino.replace(/^\/?xl\//, '').replace(/^\//, '');
    const p = plan(matriz, res);
    const { xml, escritas } = parcharHoja(await leer(ruta), p);
    zip.file(ruta, xml);
    // tablas de la hoja
    const relsHoja = await leer(ruta.replace(/worksheets\//, 'worksheets/_rels/') + '.rels');
    const encabezados = CALCULADAS.filter(k => k in matriz.cols).map(k => matriz.headers[matriz.cols[k]]);
    if (relsHoja) for (const m of relsHoja.matchAll(/Target="([^"]*tables\/[^"]+)"/g)) {
      const t = 'xl/tables/' + m[1].split('/').pop(), tx = await leer(t);
      if (tx) zip.file(t, parcharTabla(tx, encabezados));
    }
    // cadena de cálculo: se elimina para que Excel la reconstruya
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml');
      zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/g, ''));
      const ct = await leer('[Content_Types].xml');
      if (ct) zip.file('[Content_Types].xml', ct.replace(/<Override\b[^>]*calcChain[^>]*\/>/g, ''));
    }
    let libro = parcharLibro(wbXml);
    const vinculos = await quitarVinculosSinUso(zip, libro);
    if (vinculos.libro) libro = vinculos.libro;
    zip.file('xl/workbook.xml', libro);
    return { escritas, hoja: hoja.nombre, vinculosQuitados: vinculos.quitados };
  }

  // Si ninguna fórmula usa ya un libro externo ([1]Hoja!A1), se quitan los vínculos para que
  // Excel no pida «actualizar vínculos» ni guarde la copia del reporte dentro de la matriz.
  async function quitarVinculosSinUso(zip, libro) {
    const ext = Object.keys(zip.files).filter(n => /^xl\/externalLinks\/[^/]+\.xml$/.test(n));
    if (!ext.length) return { quitados: 0 };
    const partes = Object.keys(zip.files).filter(n => /^xl\/(worksheets|tables)\/[^/]+\.xml$/.test(n));
    for (const n of partes) {
      const x = await zip.file(n).async('string');
      const formulas = (x.match(/<f\b[^>]*>[^<]*<\/f>|<calculatedColumnFormula\b[^>]*>[^<]*</g) || []).join(' ');
      if (/\[\d+\]/.test(formulas)) return { quitados: 0 };
    }
    if (/<definedName\b[^>]*>[^<]*\[\d+\][^<]*<\/definedName>/.test(libro)) return { quitados: 0 };
    for (const n of Object.keys(zip.files)) if (/^xl\/externalLinks\//.test(n)) zip.remove(n);
    const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship\b[^>]*externalLink[^>]*\/>/g, ''));
    const ct = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml', ct.replace(/<Override\b[^>]*externalLink[^>]*\/>/g, ''));
    return { quitados: ext.length, libro: libro.replace(/<externalReferences>[\s\S]*?<\/externalReferences>/, '') };
  }

  const api = { llaveMatriz, llaveCRP, leerMatriz, leerCRP, cruzar, plan, parcharHoja, parcharTabla, parcharLibro, diligenciar, colLetra, fecha, iso, norm, CALCULADAS };
  if (typeof module !== 'undefined') module.exports = api; else root.MotorOXP = api;
})(typeof window !== 'undefined' ? window : globalThis);
