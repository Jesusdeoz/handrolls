(() => {
  // ---------- helpers ----------
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
  function isDelivered(p) {
    const st = (p.estado || '').toLowerCase();
    return ['despachado','entregado','retirado'].includes(st);
  }

  // ---------- DOM refs ----------
  const radios = document.querySelectorAll('input[name="modalidad"]');
  const dirBox = document.getElementById('direccionBox');
  const filterSelect = document.getElementById('stateFilter');

  const promoSelect  = document.getElementById('promoSelect');
  const detalleField = document.getElementById('detalleField');
  const montoField   = document.getElementById('montoField');
  const clearBtn     = document.getElementById('clearPromo');

  // ---------- modalida despacho/retiro ----------
  function toggleDir() {
    const v = [...radios].find(r=>r.checked)?.value;
    dirBox.classList.toggle('hidden', v !== 'despacho');
  }
  radios.forEach(r=>r.addEventListener('change', toggleDir));
  toggleDir();

  // ---------- promos ----------
  let PROMOS = [];
  async function loadPromos() {
    try {
      const r = await fetch('/api/promos', { cache: 'no-store' });
      PROMOS = await r.json();
      promoSelect.innerHTML = `<option value="">— Selecciona promo —</option>` +
        PROMOS.map(p => {
          const label = `${p.promo_nro} — ${p.detalle} (${Number(p.monto||0).toLocaleString('es-CL',{style:'currency',currency:'CLP'})})`;
          return `<option value="${p.promo_nro}">${label}</option>`;
        }).join('');
    } catch (e) { console.error('Error cargando promos', e); }
  }
  function applySelectedPromo() {
    const p = PROMOS.find(x => String(x.promo_nro) === String(promoSelect.value));
    if (!p) return;
    detalleField.value = p.detalle || '';
    montoField.value   = (p.monto != null) ? (parseInt(p.monto,10) || 0) : '';
  }
  promoSelect.addEventListener('change', applySelectedPromo);
  clearBtn.addEventListener('click', () => { promoSelect.value = ''; });
  loadPromos();

  // ---------- tabla pedidos ----------
  let FILTER = filterSelect ? filterSelect.value : 'pending';
  filterSelect.addEventListener('change', () => { FILTER = filterSelect.value; render(); });

  async function fetchAll() {
    const r = await fetch(`/api/orders`, { cache: 'no-store' });
    return await r.json();
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

    const payBadge = p.pagado
      ? `<span class="badge badge-pay-green">Pagado</span>`
      : `<span class="badge badge-pay-red">Pendiente de pago</span>`;
    const pagoCol = `${esc(pagoLabel(p.medio_pago))}<div class="sub" style="margin-top:4px">${payBadge}</div>`;

    const payBtn = p.pagado
      ? `<button class="btn btn-sm" data-action="setPaid" data-id="${p.id}" data-paid="0">Pendiente de Pago</button>`
      : `<button class="btn btn-sm" data-action="setPaid" data-id="${p.id}" data-paid="1">Pagado</button>`;

    const entregarBtn = delivered ? '' : `<button class="btn btn-sm" data-action="entregar" data-id="${p.id}">Marcar Entregado</button>`;

    return `
      <tr class="${rowCls}">
        <td>#${p.id}</td>
        <td>${hora}</td>
        <td>${esc(p.cliente_nombre)} ${tel} ${det}</td>
        <td><span class="badge ${badge}">${estadoLabel}</span></td>
        <td>${pagoCol}</td>
        <td class="right">${total}</td>
        <td class="actions">
          ${payBtn}
          ${entregarBtn}
          <a class="btn btn-sm" href="/orders/${p.id}/edit">Editar</a>
        </td>
      </tr>
    `;
  }

  async function render() {
    const all = await fetchAll();
    let rows = all;
    if (FILTER === 'pending') rows = all.filter(p => !isDelivered(p));
    else if (FILTER === 'delivered') rows = all.filter(p => isDelivered(p));

    const tbody = document.getElementById('orders_tbody');
    tbody.innerHTML = rows.map(row).join('');

    // delegación de eventos para botones
    tbody.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', async (ev) => {
        const id = parseInt(ev.currentTarget.getAttribute('data-id'), 10);
        const action = ev.currentTarget.getAttribute('data-action');
        if (action === 'setPaid') {
          const paid = ev.currentTarget.getAttribute('data-paid') === '1';
          await setPaid(id, paid);
        } else if (action === 'entregar') {
          await act(id, 'entregado');
        }
      });
    });
  }

  render();
  setInterval(render, 4000);
})();
