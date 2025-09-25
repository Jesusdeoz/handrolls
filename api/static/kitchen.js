const LATE_MINUTES = 60; // umbral para marcar en rojo

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

// Formatea "normal:2;dulce:1" a "Soya normal x2, Soya dulce x1"
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

// Kitchen solo muestra pendientes
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

async function setPaid(id, paid){
  await fetch(`/api/orders/${id}`, {
    method: 'PATCH',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({action:'set_paid', paid})
  });
  await render();
}

function row(p) {
  const delivered = isDelivered(p);
  const estadoLabel = delivered ? 'Entregado' : 'Pendiente';
  const badge = delivered ? 'badge-red' : 'badge-green';
  const rowCls = delivered ? 'row-red' : 'row-green';

  const total = Number(p.monto_total_clp || 0).toLocaleString('es-CL', { style:'currency', currency:'CLP' });
  const hora = hhmm(p.hora_creacion);

  const tel = p.telefono ? `<div class="sub">${esc(p.telefono)}</div>` : '';

  // Detalle + palitos + soya + obs
  const detBlock  = p.detalle ? `<div class="sub wrap">🧾 ${esc(p.detalle)}</div>` : "";
  const palitosBlock = (p.palitos_pares && Number(p.palitos_pares) > 0)
    ? `<div class="sub">🥢 Pares de palitos: ${Number(p.palitos_pares)}</div>` : "";
  const soyaTxt   = formatSoya(p.salsas);
  const soyaBlock = soyaTxt ? `<div class="sub" style="margin-top:6px">Soya: ${esc(soyaTxt)}</div>` : "";
  const obsBlock  = p.observaciones ? `<div class="sub">Obs: ${esc(p.observaciones)}</div>` : "";
  const det = detBlock + palitosBlock + soyaBlock + obsBlock;

  // ======= columna Pago: medio + estado de pago =======
  const payBadge = p.pagado
    ? `<span class="badge badge-pay-green">Pagado</span>`
    : `<span class="badge badge-pay-red">Pendiente de pago</span>`;
  const pagoCol = `${esc(pagoLabel(p.medio_pago))}<div class="sub" style="margin-top:4px">${payBadge}</div>`;

  // ======= acciones: botón de pago + editar / entregar =======
  const payBtn = p.pagado
    ? `<button class="btn btn-sm" onclick="setPaid(${p.id}, false)">Pendiente de Pago</button>`
    : `<button class="btn btn-sm" onclick="setPaid(${p.id}, true)">Pagado</button>`;

  const actions = `
    ${payBtn}
    ${delivered ? '' : `<button class="btn btn-sm" onclick="act(${p.id}, 'entregado')">Marcar Entregado</button>`}
    <a class="btn btn-sm" href="/orders/${p.id}/edit">Editar</a>
  `;

  return `
    <tr class="${rowCls}">
      <td>#${p.id}</td>
      <td>${hora}</td>
      <td>${esc(p.cliente_nombre)} ${tel} ${det}</td>
      <td><span class="badge ${badge}">${estadoLabel}</span></td>
      <td>${pagoCol}</td>
      <td class="right">${total}</td>
      <td class="actions">${actions}</td>
    </tr>
  `;
}

async function render() {
  try {
    const all = await fetchAll();
    const pending = all.filter(p => !isDelivered(p)); // SOLO PENDIENTES
    const tbody = document.getElementById('orders_tbody');
    const empty = document.getElementById('empty'); // si lo usas

    tbody.innerHTML = pending.map(row).join('');
    if (empty) empty.style.display = pending.length ? 'none' : 'block';
  } catch (e) {
    console.error('Kitchen render error', e);
  }
}

render();
setInterval(render, 4000);





