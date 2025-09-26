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

// Kitchen solo muestra pendientes (NO entregados/retirados/despachados)
function isDelivered(p) {
  const st = (p.estado || '').toLowerCase();
  return ['despachado', 'entregado', 'retirado'].includes(st);
}

// ¿Ya pasó una hora desde la creación?
function isLate(ts) {
  const created = new Date(ts).getTime();
  if (isNaN(created)) return false;
  const mins = (Date.now() - created) / 60000;
  return mins >= LATE_MINUTES;
}

function modalidadBadge(p) {
  const m = (p.modalidad || '').toLowerCase();
  if (m === 'despacho') return `<span class="chip chip-desp">Despacho</span>`;
  return `<span class="chip chip-ret">Retiro</span>`;
}

function direccionBlock(p) {
  const m = (p.modalidad || '').toLowerCase();
  if (m !== 'despacho') return '';
  const dir = [p.direccion, p.comuna].filter(Boolean).join(', ');
  if (!dir) return '';
  return `<div class="sub strong wrap">📍 ${esc(dir)}</div>`;
}

function row(p) {
  const total = Number(p.monto_total_clp || 0)
    .toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });

  const hora = hhmm(p.hora_creacion);
  const late = isLate(p.hora_creacion);
  const horaHtml = `<span class="time-badge${late ? ' time-badge-late' : ''}">${hora}</span>`;

  const tel = p.telefono ? `<div class="sub">${esc(p.telefono)}</div>` : '';

  const detMain = p.detalle ? `<div class="wrap">${esc(p.detalle)}</div>` : '';

  const soyaTxt = formatSoya(p.salsas);
  const soyaBlock = soyaTxt ? `<div class="sub" style="margin-top:6px">Soya: ${esc(soyaTxt)}</div>` : '';

  const palitosBlock = (p.palitos_pares && Number(p.palitos_pares) > 0)
    ? `<div class="sub" style="margin-top:6px">Pares de palitos: ${Number(p.palitos_pares)}</div>` : '';

  const obsBlock = p.observaciones
    ? `<div class="obs-block">Obs: ${esc(p.observaciones)}</div>`
    : '';

  return `
    <tr class="row-green">
      <td class="id">#${p.id}</td>
      <td class="hora">${horaHtml}</td>
      <td class="info">
        <div class="topline">
          <span class="cliente">${esc(p.cliente_nombre)}</span>
          ${modalidadBadge(p)}
        </div>
        ${tel}
        ${direccionBlock(p)}
        ${detMain}
        ${soyaBlock}
        ${palitosBlock}
        ${obsBlock}
      </td>
      <td class="estado"><span class="badge badge-green">Pendiente</span></td>
      <td class="pago">${esc(pagoLabel(p.medio_pago))}</td>
      <td class="right total">${total}</td>
    </tr>
  `;
}

async function render() {
  try {
    const all = await fetchAll();
    const pending = all.filter(p => !isDelivered(p)); // SOLO PENDIENTES

    const tbody = document.getElementById('orders_tbody');
    const empty = document.getElementById('empty'); // si lo usas en kitchen.html

    tbody.innerHTML = pending.map(row).join('');
    if (empty) empty.style.display = pending.length ? 'none' : 'block';
  } catch (e) {
    console.error('Kitchen render error', e);
  }
}

render();
setInterval(render, 4000);
