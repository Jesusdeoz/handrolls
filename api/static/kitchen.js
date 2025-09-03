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

// Entregado = cualquiera de estos estados; Kitchen los OCULTA
function isDelivered(p) {
  const st = (p.estado || '').toLowerCase();
  return ['despachado','entregado','retirado'].includes(st);
}

function row(p) {
  const total = Number(p.monto_total_clp || 0).toLocaleString('es-CL', { style:'currency', currency:'CLP' });
  const hora = hhmm(p.hora_creacion);

  const tel = p.telefono ? `<div class="sub">${esc(p.telefono)}</div>` : '';

  // 📝 Detalle + salsas + observaciones (cada uno si existe)
  const det = p.detalle ? `📝 ${esc(p.detalle)}` : '';
  const sals = p.salsas ? `Salsas: ${esc(p.salsas)}` : '';
  const obs  = p.observaciones ? `Obs: ${esc(p.observaciones)}` : '';
  const detailBlock = [det, sals, obs].filter(Boolean).join(' — ');
  const detailHtml = detailBlock ? `<div class="sub">${detailBlock}</div>` : '';

  return `
    <tr class="row-green">
      <td>#${p.id}</td>
      <td>${hora}</td>
      <td>${esc(p.cliente_nombre)} ${tel} ${detailHtml}</td>
      <td><span class="badge badge-green">Pendiente</span></td>
      <td>${esc(pagoLabel(p.medio_pago))}</td>
      <td class="right">${total}</td>
    </tr>
  `;
}


async function render() {
  try {
    const all = await fetchAll();
    const pending = all.filter(p => !isDelivered(p)); // <-- SOLO PENDIENTES

    const tbody = document.getElementById('orders_tbody');
    const empty = document.getElementById('empty');

    tbody.innerHTML = pending.map(row).join('');
    empty.style.display = pending.length ? 'none' : 'block';
  } catch (e) {
    console.error('Kitchen render error', e);
  }
}

render();
setInterval(render, 4000);

