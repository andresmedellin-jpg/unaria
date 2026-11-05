// Datos de ejemplo de Loyverse para el demo (Curandero, café en Mitras): 120 días de tickets con sus líneas y pagos,
// catálogo, clientes, empleados e inventario, como los dejaría la función "loyverse" en la base. Todo inventado
// (menú y precios de muestra) y siempre igual (semilla fija). También arma las vistas v_lv_* que en la base son SQL.
(function () {
  'use strict';
  window.__DEMO_LOYVERSE = function (ORG) {
    let semilla = 20261104;
    const rnd = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const entre = (a, b) => Math.floor(a + rnd() * (b - a + 1));
    const elige = (l) => l[Math.floor(rnd() * l.length)];
    const pesos = (l) => { const t = l.reduce((s, x) => s + x[1], 0); let r = rnd() * t; for (const x of l) { r -= x[1]; if (r <= 0) return x[0]; } return l[0][0]; };
    const CID = 'lvc-cur', base = { org_id: ORG, cuenta_id: CID };
    const diaLocal = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

    const lv_cuentas = [{ id: CID, org_id: ORG, empresa_id: 'emp-cur', merchant_id: 'demo-curandero', negocio: 'Curandero', moneda: 'MXN', activo: true, estado: 'al_dia',
      historial_desde: null, ultimo_sync: new Date(Date.now() - 4 * 60e3).toISOString(), ultimo_error: null, resumen: {} }];
    const lv_tiendas = [{ ...base, id: 'st-mitras', nombre: 'Curandero Mitras', direccion: 'Celaya 3133, Mitras Centro, Monterrey' }];
    const CATS = [['cat-caf', 'Café'], ['cat-beb', 'Bebidas frías'], ['cat-des', 'Desayunos'], ['cat-pan', 'Pan y postres']];
    const lv_categorias = CATS.map(([id, nombre]) => ({ ...base, id, nombre, borrado: false }));
    // [id, nombre, categoría, precio, costo, popularidad, inventario]
    const MENU = [
      ['it-ame', 'Americano', 'cat-caf', 45, 9, 14, false], ['it-lat', 'Latte', 'cat-caf', 62, 14, 16, false], ['it-cap', 'Capuchino', 'cat-caf', 62, 14, 9, false],
      ['it-mat', 'Matcha latte', 'cat-caf', 78, 22, 6, false], ['it-chai', 'Chai latte', 'cat-caf', 72, 18, 4, false], ['it-esp', 'Espresso', 'cat-caf', 38, 7, 4, false],
      ['it-cold', 'Cold brew', 'cat-beb', 65, 13, 8, false], ['it-frap', 'Frappé de moka', 'cat-beb', 82, 20, 6, false], ['it-jugo', 'Jugo verde', 'cat-beb', 58, 16, 5, false],
      ['it-lim', 'Limonada mineral', 'cat-beb', 48, 9, 4, false],
      ['it-mol', 'Molletes', 'cat-des', 95, 30, 6, false], ['it-enf', 'Enfrijoladas', 'cat-des', 115, 36, 5, false], ['it-avo', 'Pan con aguacate', 'cat-des', 120, 42, 6, false],
      ['it-sand', 'Sándwich de pavo', 'cat-des', 110, 40, 5, false], ['it-bowl', 'Bowl de fruta y granola', 'cat-des', 98, 34, 4, false],
      ['it-conc', 'Concha', 'cat-pan', 32, 9, 7, true], ['it-cro', 'Croissant', 'cat-pan', 45, 15, 6, true], ['it-rol', 'Rol de canela', 'cat-pan', 52, 15, 6, true],
      ['it-gal', 'Galleta de chispas', 'cat-pan', 30, 8, 5, true], ['it-pay', 'Pay de queso', 'cat-pan', 68, 22, 3, true],
    ];
    const lv_articulos = MENU.map(([id, nombre, cat, , , , inv]) => ({ ...base, id, nombre, categoria_id: cat, controla_inventario: inv, es_compuesto: false, borrado: false }));
    const lv_variantes = MENU.map(([id, , , precio, costo]) => ({ ...base, id: id + '-v', articulo_id: id, nombre: null, sku: null, precio, costo, borrado: false }));
    const lv_tipos_pago = [['pt-ef', 'Efectivo', 'CASH'], ['pt-tj', 'Tarjeta', 'CARD'], ['pt-tr', 'Transferencia', 'OTHER']].map(([id, nombre, tipo]) => ({ ...base, id, nombre, tipo, borrado: false }));
    const lv_empleados = [['em-1', 'Fer (barista)'], ['em-2', 'Diego (barista)'], ['em-3', 'Sofi (caja)']].map(([id, nombre]) => ({ ...base, id, nombre, tiendas: ['st-mitras'], borrado: false }));
    const NOMBRES = ['Ana Garza', 'Luis Treviño', 'Mariana Cantú', 'Jorge Villarreal', 'Sofía Martínez', 'Daniel Salinas', 'Paola Rodríguez', 'Andrés González', 'Valeria Lozano', 'Ricardo Flores',
      'Fernanda Elizondo', 'Diego Hernández', 'Regina Leal', 'Emilio Garza', 'Camila Sepúlveda', 'Pablo Zambrano', 'Natalia Guerra', 'Rodrigo Cárdenas', 'Lucía Medina', 'Mauricio Ríos',
      'Dra. Karla Peña', 'Dr. Iván Quiroga', 'Alejandra Ramos', 'Tomás Delgado', 'Ximena Ochoa', 'Sebastián Tamez', 'Renata Montemayor', 'Óscar Benavides', 'Daniela Vela', 'Héctor Alanís'];
    const lv_clientes = NOMBRES.map((nombre, k) => ({ ...base, id: 'cl-' + k, nombre, telefono: '81' + String(10000000 + k * 7919).slice(0, 8), visitas: 0, total_gastado: 0, puntos: 0, primera_visita: null, ultima_visita: null }));

    // ---------- tickets: 120 días, lunes a sábado de 8 a 18 ----------
    const lv_tickets = [], lv_lineas = [], lv_pagos = [];
    const HOY = new Date(); let num = 10000;
    const curva = { 8: 1.5, 9: 1.7, 10: 1.2, 11: .8, 12: .8, 13: 1.3, 14: 1.1, 15: .6, 16: .6, 17: .7 };
    for (let k = 119; k >= 0; k--) {
      const d = new Date(HOY); d.setDate(d.getDate() - k);
      const dow = d.getDay(); if (dow === 0) continue;                         // domingo cerrado
      const crec = 1 + (119 - k) / 119 * 0.18;                                 // el negocio va creciendo
      let n = Math.round((dow === 6 ? 95 : dow === 1 ? 62 : 74) * crec * (0.85 + rnd() * 0.3));
      if (k === 0) { const h = new Date().getHours(); n = Math.round(n * Math.max(0, Math.min(1, (h - 8) / 10))); }
      for (let t = 0; t < n; t++) {
        const hora = Number(pesos(Object.entries(curva).map(([h, w]) => [h, w])));
        const f = new Date(d); f.setHours(hora, entre(0, 59), entre(0, 59), 0);
        if (k === 0 && f > new Date()) continue;
        const numero = String(++num);
        const items = []; const nl = pesos([[1, 30], [2, 40], [3, 20], [4, 10]]);
        for (let i = 0; i < nl; i++) {
          const m = pesos(MENU.map((x) => [x, x[5] * (x[2] === 'cat-des' && hora >= 12 && hora <= 14 ? 1.6 : x[2] === 'cat-caf' && hora <= 10 ? 1.4 : 1)]));
          const ya = items.find((x) => x.m === m); if (ya) ya.q++; else items.push({ m, q: 1 });
        }
        let total = 0;
        items.forEach(({ m, q }, i) => { const tot = m[3] * q; total += tot;
          lv_lineas.push({ ...base, numero, n: i + 1, articulo_id: m[0], variante_id: m[0] + '-v', nombre: m[1], variante: null, cantidad: q, precio: m[3], total: tot, bruto: tot, costo: m[4], costo_total: m[4] * q, descuento: 0, modificadores: m[2] === 'cat-caf' && rnd() < .3 ? [{ name: 'Leche', option: elige(['Avena', 'Almendra', 'Deslactosada']) }] : [] }); });
        const pago = pesos([['pt-tj', 55], ['pt-ef', 35], ['pt-tr', 10]]);
        const propina = pago === 'pt-tj' && rnd() < .55 ? Math.round(total * elige([.1, .1, .15])) : 0;
        const cli = rnd() < .32 ? lv_clientes[Math.floor(Math.pow(rnd(), 1.25) * lv_clientes.length)] : null;
        const cancelado = rnd() < .006 ? new Date(f.getTime() + 3 * 60e3).toISOString() : null;
        lv_tickets.push({ ...base, numero, tipo: 'SALE', fecha: f.toISOString(), dia: diaLocal(f), tienda_id: 'st-mitras', empleado_id: elige(['em-1', 'em-2', 'em-3']),
          cliente_id: cli?.id || null, opcion_consumo: pesos([['Comer aquí', 55], ['Para llevar', 40], ['A domicilio', 5]]), total, impuestos: Math.round(total / 1.16 * 0.16 * 100) / 100,
          descuento: 0, propina, cancelado_en: cancelado, nota: null, datos: {} });
        lv_pagos.push({ ...base, numero, n: 1, tipo_pago_id: pago, nombre: lv_tipos_pago.find((p) => p.id === pago).nombre, tipo: lv_tipos_pago.find((p) => p.id === pago).tipo, monto: total + propina, pagado_en: f.toISOString() });
        if (cli && !cancelado) { cli.visitas++; cli.total_gastado += total; cli.puntos = Math.round(cli.total_gastado * 0.05); cli.primera_visita ||= f.toISOString(); cli.ultima_visita = f.toISOString(); }
      }
    }
    // Unas devoluciones
    lv_tickets.filter((_, i) => i % 900 === 450).forEach((t) => {
      const numero = 'D' + t.numero, l = lv_lineas.find((x) => x.numero === t.numero);
      lv_tickets.push({ ...t, numero, tipo: 'REFUND', devolucion_de: t.numero, total: l.total, propina: 0, cliente_id: null });
      lv_lineas.push({ ...l, numero, n: 1 });
      lv_pagos.push({ ...base, numero, n: 1, tipo_pago_id: 'pt-ef', nombre: 'Efectivo', tipo: 'CASH', monto: l.total, pagado_en: t.fecha });
    });
    const lv_inventario = MENU.filter((m) => m[6]).map((m) => ({ ...base, variante_id: m[0] + '-v', tienda_id: 'st-mitras', existencia: entre(1, 24), actualizado: new Date().toISOString() }));

    // ---------- vistas (en la base son SQL: 0032_loyverse.sql) ----------
    const tk = new Map(lv_tickets.map((t) => [t.numero, t]));
    const vivos = lv_tickets.filter((t) => !t.cancelado_en);
    const signo = (t) => (t.tipo === 'REFUND' ? -1 : 1);
    const agrupa = (l, llave, ini, suma) => { const m = new Map(); l.forEach((x) => { const k = llave(x); if (!m.has(k)) m.set(k, ini(x)); suma(m.get(k), x); }); return [...m.values()]; };
    const v_lv_ventas_dia = agrupa(vivos, (t) => t.dia + t.tienda_id, (t) => ({ ...base, dia: t.dia, tienda_id: t.tienda_id, tickets: 0, venta: 0, impuestos: 0, descuentos: 0, propinas: 0, clientes: 0, _c: new Set() }),
      (a, t) => { if (t.tipo === 'SALE') a.tickets++; a.venta += signo(t) * t.total; a.impuestos += signo(t) * t.impuestos; a.propinas += t.propina; if (t.cliente_id) { a._c.add(t.cliente_id); a.clientes = a._c.size; } })
      .map(({ _c, ...x }) => x);
    const v_lv_productos_dia = agrupa(lv_lineas.filter((l) => tk.has(l.numero) && !tk.get(l.numero).cancelado_en), (l) => tk.get(l.numero).dia + l.articulo_id,
      (l) => ({ ...base, dia: tk.get(l.numero).dia, tienda_id: tk.get(l.numero).tienda_id, articulo_id: l.articulo_id, variante_id: l.variante_id, nombre: l.nombre, variante: null, cantidad: 0, venta: 0, costo: 0 }),
      (a, l) => { const s = signo(tk.get(l.numero)); a.cantidad += s * l.cantidad; a.venta += s * l.total; a.costo += s * (l.costo_total || 0); });
    const v_lv_pagos_dia = agrupa(lv_pagos.filter((p) => tk.has(p.numero) && !tk.get(p.numero).cancelado_en), (p) => tk.get(p.numero).dia + p.nombre,
      (p) => ({ ...base, dia: tk.get(p.numero).dia, tienda_id: tk.get(p.numero).tienda_id, forma: p.nombre, tipo: p.tipo, monto: 0, pagos: 0 }),
      (a, p) => { a.monto += signo(tk.get(p.numero)) * (p.monto - (tk.get(p.numero).propina || 0)); a.pagos++; });
    const v_lv_horas = agrupa(vivos, (t) => { const f = new Date(t.fecha); return t.dia + '-' + f.getHours(); },
      (t) => { const f = new Date(t.fecha); return { ...base, tienda_id: t.tienda_id, dia: t.dia, dow: ((f.getDay() + 6) % 7) + 1, hora: f.getHours(), tickets: 0, venta: 0 }; },
      (a, t) => { if (t.tipo === 'SALE') a.tickets++; a.venta += signo(t) * t.total; });

    return { lv_cuentas, lv_tiendas, lv_categorias, lv_articulos, lv_variantes, lv_tipos_pago, lv_empleados, lv_clientes, lv_tickets, lv_lineas, lv_pagos, lv_inventario,
      v_lv_ventas_dia, v_lv_productos_dia, v_lv_pagos_dia, v_lv_horas };
  };
})();
