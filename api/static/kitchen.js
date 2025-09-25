// ----- Config -----
const LATE_MINUTES = 60; // umbral para marcar la hora en rojo

// ----- Utils -----
async function fetchAll() {
  const r = await fetch(`/api/orders`, { cache: 'no-store' });
  return await r.json();
}

function hhmm(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function esc(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])
  );
}

function pagoLabel(v) {
  switch ((v || '').toLowerCase()) {
    case 'efectivo': return 'Efectivo';
    case 'debito_credito': return 'Débito/Crédito';
    case 'transferencia': return 'Transferencia';
    default: return v || '-';
  }
}

// "normal:2;dulce:1" -> "Soya normal x2, Soya dulce x1"
function formatSoya(s) {
  if (!s) return "";
  const map = {};
  s.split(";").forEach(pair => {
    const [k, v] = pair.split(":");
    if (k && v) map[k.trim()] = parseInt(v, 10) || 0;
  });
  const parts = [];
  if (map.normal) parts.push(`Soya normal x${map.normal}`);
  if (map.dulce)  parts.push(`Soya dulce x${map.dulce}`);
  return parts.join(", ");
}

// Kitchen solo muestra pendientes (no entregados/retirados/despachados)
function isDelivered(p) {
  const st = (p.estado || '').toLowerCase();
  return ['despachado','entregado','retirado'].includes(st);
}

// ¿Ya pasó una hora desde la creación?
function isLate(ts) {
  const created = new Date(ts).getTime();
  if (isNaN(created)) return false;
  const mins = (Date.now() - created) / 60000;
  return mins >= LATE_MINUTES;
}

// ----- Render de filas -----
function row(p) {
  const total = Number(p.monto_total_clp || 0).toLocaleString('es-CL', { style:'currency', currency:'CLP' });

  // Hora con rectángulo; rojo si tarde
  const hora = hhmm(p.hora_creacion);
  const late = isLate(p.hora_creacion);
  const horaHtml = `<span class="time-badge${late ? ' time-badge-late' : ''}">${hora}</span>`;

  // Teléfono (debajo del nombre)
  const tel  = p.telefono ? `<div class="sub">${esc(p.telefono)}</div>` : '';

  // Bloques ordenados (cada uno en su línea):
  const detBlock  = p.detalle ? `<div class="sub wrap">🧾 ${esc(p.detalle)}</div>` : "";

  const palitosBlock = (p.palitos_pares && Number(p.palitos_pares) > 0)
    ? `<div class="sub">🥢 Pares de palitos: ${Number(p.palitos_pares)}</div>` : "";

  const soyaTxt   = formatSoya(p.salsas);
  const soyaBlock = soyaTxt ? `<div class="sub" style="margin-top:6px">Soya: ${esc(soyaTxt)}</div>` : "";

  const obsBlock  = p.observaciones
    ? `<div class="sub"><span class="obs">Obs: ${esc(p.observaciones)}</span></div>`
    : "";

  const detailHtml = detBlock + palitosBlock + soyaBlock + obsBlock;

  // Pago: medio + badge de estado de pago
  const payBadge = p.pagado
    ? `<span class="badge badge-pay-green">Pagado</span>`
    : `<span class="badge badge-pay-red">Pendiente de pago</span>`;
  const pagoCol = `${esc(pagoLabel(p.medio_pago))}<div class="sub" style="margin-top:4px">${payBadge}</div>`;

  return `
    <tr class="row-green">
      <td>#${p.id}</td>
      <td>${horaHtml}</td>
      <td>${esc(p.cliente_nombre)} ${tel} ${detailHtml}</td>
      <td><span class="badge badge-green">Pendiente</span></td>
      <td>${pagoCol}</td>
      <td class="right">${total}</td>
    </tr>
  `;
}

// ----- Ciclo de pintado -----
async function render() {
  try {
    const all = await fetchAll();
    const pending = all.filter(p => !isDelivered(p)); // SOLO pendientes

    const tbody = document.getElementById('orders_tbody');
    const empty = document.getElementById('empty'); // opcional en kitchen.html

    tbody.innerHTML = pending.map(row).join('');
    if (empty) empty.style.display = pending.length ? 'none' : 'block';
  } catch (e) {
    console.error('Kitchen render error', e);
  }
}

render();
setInterval(render, 4000);
