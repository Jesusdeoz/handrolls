// ---------- Mostrar/ocultar dirección por modalidad ----------
(function initDireccionToggle(){
  const radios = document.querySelectorAll('input[name="modalidad"]');
  const box = document.getElementById('direccionBox');
  function toggleDir() {
    const v = [...radios].find(r=>r.checked)?.value;
    box.style.display = (v === 'despacho') ? '' : 'none';
  }
  radios.forEach(r=>r.addEventListener('change', toggleDir));
  toggleDir();
})();

// ---------- PROMOS + DESPACHO → TOTAL (Total oculto en form) ----------
let PROMOS = [];

const promoSelect    = document.getElementById('promoSelect');
const detalleField   = document.getElementById('detalleField');
const promoAmountEl  = document.getElementById('promoAmount');   // EDITABLE
const despachoField  = document.getElementById('despachoField');
const montoField     = document.getElementById('montoField');    // hidden total
const clearBtn       = document.getElementById('clearPromo');
const createForm     = document.querySelector('form[action="/orders"]');

function toInt(x){ const n = parseInt(x,10); return isNaN(n) ? 0 : n; }

function setHiddenTotal(total){
  if (montoField) montoField.value = total;
}

function recalcTotal(){
  const promo = toInt(promoAmountEl?.value || 0);   // <- SIEMPRE usa el input
  const desp  = toInt(despachoField?.value || 0);
  setHiddenTotal(promo + desp);
}

async function loadPromos() {
  try {
    const r = await fetch('/api/promos', { cache: 'no-store' });
    PROMOS = await r.json();
    if (promoSelect) {
      promoSelect.innerHTML = `<option value="">— Selecciona promo —</option>` +
        PROMOS.map(p => {
          const label = `${p.promo_nro} — ${p.detalle} (${Number(p.monto||0).toLocaleString('es-CL',{style:'currency',currency:'CLP'})})`;
          return `<option value="${p.promo_nro}">${label}</option>`;
        }).join('');
    }
  } catch (e) { console.error('Error cargando promos', e); }
}

function applySelectedPromo() {
  const p = PROMOS.find(x => String(x.promo_nro) === String(promoSelect.value));
  if (!p) return;
  // Autocompleta, pero deja editable
  if (detalleField)   detalleField.value   = p.detalle || '';
  if (promoAmountEl)  promoAmountEl.value  = toInt(p.monto) || 0;
  recalcTotal();
}

promoSelect?.addEventListener('change', applySelectedPromo);
clearBtn?.addEventListener('click', () => {
  if (!promoSelect) return;
  promoSelect.value = '';
  // No tocamos el monto promo: si el usuario lo escribió a mano, se respeta
});

promoAmountEl?.addEventListener('input', recalcTotal);
despachoField?.addEventListener('input', recalcTotal);

// Al enviar, garantizamos total = montoPromo(input) + despacho
createForm?.addEventListener('submit', () => {
  recalcTotal();
});

// Carga inicial + primer cálculo
loadPromos();
recalcTotal();


// ---------- LISTADO (tabla del mostrador) ----------
const filterSelect = document.getElementById('stateFilter');
let FILTER = filterSelect ? filterSelect.value : 'pending';

filterSelect?.addEventListener('change', () => {
  FILTER = filterSelect.value;
  render();
});

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

function isDelivered(p) {
  const st = (p.estado || '').toLowerCase();
  return ['despachado','entregado','retirado'].includes(st);
}

async function act(id, action) {
  await fetch(`/api/orders/${id}`, {
    method: 'PATCH',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({action})
  });
  await render();
}

async function setPaid(id, paid){
  await fetch(`/api/orders/${id}`, {
    method: 'PATCH',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({action:'set_paid', paid})
  });
  await render();
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

/* ======= NUEVO: Modalidad (chip) y Dirección en pedidos de despacho ======= */
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
  const delivered = isDelivered(p);
  const estadoLabel = delivered ? 'Entregado' : 'Pendiente';
  const badge = delivered ? 'badge-red' : 'badge-green';
  const rowCls = delivered ? 'row-red' : 'row-green';

  const total = Number(p.monto_total_clp || 0).toLocaleString('es-CL', { style:'currency', currency:'CLP' });
  const hora = hhmm(p.hora_creacion);
  const tel = p.telefono ? `<div class="sub">${esc(p.telefono)}</div>` : '';

  // Primera línea: Cliente + chip modalidad
  const topline = `
    <div class="topline">
      <span class="cliente">${esc(p.cliente_nombre)}</span>
      ${modalidadBadge(p)}
    </div>
  `;

  // Detalle + palitos + soya + obs (no mostramos desglose de despacho aquí)
  const detBlock  = p.detalle ? `<div class="sub wrap">${esc(p.detalle)}</div>` : "";
  const palitosBlock = (p.palitos_pares && Number(p.palitos_pares) > 0)
    ? `<div class="sub">Pares de palitos: ${Number(p.palitos_pares)}</div>` : "";
  const soyaTxt   = formatSoya(p.salsas);
  const soyaBlock = soyaTxt ? `<div class="sub" style="margin-top:6px">Soya: ${esc(soyaTxt)}</div>` : "";
  const obsBlock  = p.observaciones ? `<div class="sub">Obs: ${esc(p.observaciones)}</div>` : "";
  const address   = direccionBlock(p);

  const det = topline + tel + address + detBlock + palitosBlock + soyaBlock + obsBlock;

  const payBadge = p.pagado
    ? `<span class="badge badge-pay-green">Pagado</span>`
    : `<span class="badge badge-pay-red">Pendiente de pago</span>`;
  const pagoCol = `${esc(pagoLabel(p.medio_pago))}<div class="sub" style="margin-top:4px">${payBadge}</div>`;

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
      <td>${det}</td>
      <td><span class="badge ${badge}">${estadoLabel}</span></td>
      <td>${pagoCol}</td>
      <td class="right">${total}</td>
      <td class="actions">${actions}</td>
    </tr>
  `;
}

async function render() {
  const all = await fetchAll();
  let rows = all;
  if (FILTER === 'pending') rows = all.filter(p => !isDelivered(p));
  else if (FILTER === 'delivered') rows = all.filter(p => isDelivered(p));
  document.getElementById('orders_tbody').innerHTML = rows.map(row).join('');
}

render();
setInterval(render, 4000);
