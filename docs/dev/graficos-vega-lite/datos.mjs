// Datos sintéticos con la forma de las 12 figuras de referencia (semilla fija).
let s = 42;
const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const n = () => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return u - 3; }; // ~N(0,1)
const iso = (d) => d.toISOString().slice(0, 10);

export const datos = {};

// 1. CVR diario de Meta, abr–ago, con una caída en junio
{
  const filas = [];
  for (let d = new Date('2025-04-01'); d <= new Date('2025-08-31'); d.setDate(d.getDate() + 1)) {
    const f = iso(d);
    let v = 0.017 + n() * 0.0022;
    if (f >= '2025-05-25' && f <= '2025-06-04') v += 0.009 * (1 - Math.abs(f.slice(8) - 31) / 10);
    if (f >= '2025-06-10' && f <= '2025-06-26') v = 0.010 + n() * 0.0015;
    filas.push({ fecha: f, cvr: +v.toFixed(4) });
  }
  datos.cvr_diario = filas;
}
// 2. CPA del mes por campaña-mes (sesgado)
datos.cpa_mes = Array.from({ length: 96 }, () => ({ cpa: Math.round(r() < 0.8 ? Math.abs(n()) * 900 + 50 : 4000 + r() * 4500) }));
// 3. Peso en el cálculo
datos.peso = [
  ['Meta • Prospección', 0.143, 0.351], ['Search • Marca', 0.143, 0.321], ['Search • Genérica', 0.143, 0.142],
  ['Meta • Retargeting', 0.143, 0.133], ['TikTok • Awareness', 0.107, 0.021], ['Display • Retargeting', 0.143, 0.018],
  ['YouTube • Awareness', 0.143, 0.008], ['Meta • Prueba influencers', 0.024, 0.001],
].flatMap(([canal, a, b]) => [{ canal, calculo: 'Promedio simple', peso: a }, { canal, calculo: 'CPA del cliente', peso: b }]);
// 4. CPA diario por campaña
datos.cpa_diario = [['Search - Marca', 240, 50], ['Meta - Prospección', 360, 60], ['Meta - Retargeting', 380, 110], ['Search - Genérica', 820, 260]]
  .flatMap(([campana, m, sd]) => Array.from({ length: 150 }, () => ({ campana, cpa: Math.max(60, Math.round(m + n() * sd * (r() < 0.05 ? 3 : 1))) })));
// 5. Ingresos del día
datos.ingresos = Array.from({ length: 365 }, () => ({ ingresos: Math.round(r() < 0.06 ? 300000 + r() * 600000 : 135000 + n() * 30000) }));
// 6. Cupones vs gasto por mes
datos.cupones = [[1, 210, 52], [2, 120, 38], [3, 215, 50], [4, 160, 48], [5, 480, 75], [6, 370, 60], [7, 230, 54], [8, 232, 52], [9, 190, 53], [10, 220, 55], [11, 950, 97], [12, 960, 115]]
  .map(([mes, cupones, gasto]) => ({ mes, cupones, gasto }));
// 7. ROAS de Meta por mes
datos.roas_meta = [[7, 2.97], [8, 3.29], [9, 2.79], [10, 2.98], [11, 4.9], [12, 3.58]].map(([mes, roas]) => ({ mes, roas }));
// 8. TV vs ventas por semana
datos.tv_semana = Array.from({ length: 104 }, () => {
  const alta = r() < 0.2, tv = alta ? (r() < 0.15 ? 0 : 350000 + r() * 500000) : (r() < 0.55 ? 0 : 100000 + r() * 220000);
  return { tv: Math.round(tv), ventas: Math.round(2300000 + tv * 3.2 + (alta ? 1000000 : 0) + n() * 350000), temporada: alta ? 'Alta' : 'Baja' };
});
// 9. Matriz de correlaciones (formato largo, como lo deja un UNPIVOT)
{
  const v = ['tv', 'search', 'meta', 'tiktok', 'youtube', 'ventas'];
  const m = [[1, .30, .33, .05, .08, .84], [.30, 1, .98, .10, .04, .66], [.33, .98, 1, .13, .02, .68], [.05, .10, .13, 1, .13, .16], [.08, .04, .02, .13, 1, .10], [.84, .66, .68, .16, .10, 1]];
  datos.correlaciones = v.flatMap((a, i) => v.map((b, j) => ({ a, b, r: m[i][j] })));
}
// 10. ROAS por campaña
datos.roas = [['Search - Marca', 5.22], ['Meta - Retargeting', 3.41], ['Meta - Prospección', 3.28], ['Meta - Prueba influencers', 2.0], ['Search - Genérica', 1.43], ['Display - Retargeting', 0.73], ['TikTok - Awareness', 0.51], ['YouTube - Awareness', 0.2]]
  .map(([campana, roas]) => ({ campana, roas }));
// 11. Lift con intervalo
datos.lift = [['Ingenua (todos)', 9.0, 6.2, 11.8], ['No intensivos', 4.6, 0.9, 8.3], ['Intensivos', 3.7, -1.3, 8.7], ['Ajustada', 4.2, 1.2, 7.2]]
  .map(([grupo, lift, bajo, alto]) => ({ grupo, lift, bajo, alto }));
// 12. Inversión vs ventas por semana
datos.inversion = Array.from({ length: 104 }, () => {
  const x = r() < 0.08 ? 1200000 + r() * 1200000 : 250000 + r() * 800000;
  return { inversion: Math.round(x), ventas: Math.round(1500000 + x * 2.3 + n() * 300000) };
});
