// Cuánto le toca a cada unidad de luz, gas y agua en un mes, con la misma regla que el módulo de Lecturas:
// consumo = lectura del mes − lectura anterior (o la inicial del medidor); la primera lectura sin base no se cobra.
// Tarifa fija (precio por unidad + cargo fijo) o reparto del recibo real de la compañía según lo consumido.
// Lo usa el reporte a propietarios; Lecturas tiene su propia copia de la regla (si cambia una, cambiar la otra).
export function cobroServicios({ medidores, lecturas, recibos, tarifas }, periodo) {
  const porUnidad = {};
  for (const m of medidores) {
    const l = lecturas.find((x) => x.medidor_id === m.id && x.periodo === periodo);
    if (!l) continue;
    const prev = lecturas.filter((x) => x.medidor_id === m.id && x.periodo < periodo).sort((a, b) => b.periodo.localeCompare(a.periodo))[0];
    const ant = prev ? Number(prev.lectura) : m.lectura_inicial == null ? null : Number(m.lectura_inicial);
    if (ant == null) continue;
    const c = Number(l.lectura) - ant;
    const t = tarifas.find((x) => x.centro_id === m.centro_id && x.servicio === m.servicio) || { modo: 'tarifa', precio: 0, cargo_fijo: 0 };
    let imp;
    if (t.modo === 'prorrateo') {
      const r = recibos.find((x) => x.centro_id === m.centro_id && x.servicio === m.servicio && x.periodo === periodo);
      if (!r || !(Number(r.consumo) > 0)) continue;
      imp = Math.round(c * Number(r.monto) / Number(r.consumo) * 100) / 100 + Number(t.cargo_fijo || 0);
    } else imp = Math.round((c * Number(t.precio || 0) + Number(t.cargo_fijo || 0)) * 100) / 100;
    const u = (porUnidad[m.unidad_id] ||= { luz: 0, gas: 0, agua: 0, total: 0 });
    u[m.servicio] += imp; u.total = Math.round((u.total + imp) * 100) / 100;
  }
  return porUnidad;
}
