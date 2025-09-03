async function fetchAll() {
  const r = await fetch(`/api/orders`);
  return await r.json();
}

function hhmm(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// escapar para evitar XSS si llega texto con < >
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

function row(p) {
  const st = (p.estado || '').toLowerCase();
  const isDelivered = ['despachado', 'entregado', 'retirado'].includes(st);
  const estadoLabel = isDelivered ? 'Entregado' : 'Pendiente';
  const badge = isDelivered ? 'badge-red' : 'badge-green';
  const rowCls = isDelivered ? 'row-red' : 'row-green';

  const total = Number(p.monto_total_clp || 0).toLocaleString('es-CL', { style:'currency', currency:'CLP' });
  const hora = hhmm(p.hora_creacion);

  const tel = p.telefono ? `<div class="sub">${esc(p.telefono)}</div>` : '';
  const det = p.detalle ? `<div class="sub">📝 ${esc(p.detalle)}${p.salsas ? ' — Salsas: ' + esc(p.salsas) : ''}</div>` : '';

  return `
    <tr class="${rowCls}">
      <td>#${p.id}</td>
      <td>${hora}</td>
      <td>${esc(p.cliente_nombre)} ${tel} ${det}</td>
      <td><span class="badge ${badge}">${estadoLabel}</span></td>
      <td>${esc(pagoLabel(p.medio_pago))}</td>
      <td class="right">${total}</td>
    </tr>
  `;
}


async function render() {
  try {
    const all = await fetchAll();
    // ya vienen ordenados por hora_creacion asc; si no, puedes ordenar aquí.
    document.getElementById('orders_tbody').innerHTML = all.map(row).join('');
  } catch (e) {
    console.error('render error', e);
  }
}

render();
setInterval(render, 4000);

