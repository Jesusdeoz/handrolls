// ===== Helpers =====
function toInt(x){ const n = parseInt(x,10); return isNaN(n) ? 0 : n; }

// ===== Mostrar/ocultar dirección según modalidad =====
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

// ===== PROMOS en Editar =====
let PROMOS = [];

const form           = document.getElementById('editForm');
const promoSelect    = document.getElementById('promoSelect');
const clearBtn       = document.getElementById('clearPromo');
const detalleField   = document.getElementById('detalleField');

const promoAmountEl  = document.getElementById('promoAmount');   // visible (editable en Editar)
const despachoField  = document.getElementById('despachoField'); // visible
const montoField     = document.getElementById('montoField');    // hidden (se envía)

// carga promos
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
  } catch (e) {
    console.error('Error cargando promos', e);
  }
}

// aplicar promo elegida
function applySelectedPromo() {
  const p = PROMOS.find(x => String(x.promo_nro) === String(promoSelect.value));
  if (!p) return;
  if (detalleField) detalleField.value = p.detalle || '';
  if (promoAmountEl) promoAmountEl.value = toInt(p.monto) || 0;
  recalcAndSetHiddenTotal();
}

// recalcula total oculto = monto promo + despacho
function recalcAndSetHiddenTotal(){
  const promo = toInt(promoAmountEl?.value || 0);
  const desp  = toInt(despachoField?.value || 0);
  const total = promo + desp;
  if (montoField) montoField.value = total;
}

// listeners
promoSelect?.addEventListener('change', applySelectedPromo);
clearBtn?.addEventListener('click', () => { if (promoSelect) promoSelect.value = ''; });
promoAmountEl?.addEventListener('input', recalcAndSetHiddenTotal);
despachoField?.addEventListener('input', recalcAndSetHiddenTotal);

// al enviar, aseguramos que el hidden tenga promo+despacho
form?.addEventListener('submit', () => {
  recalcAndSetHiddenTotal();
});

// init
loadPromos();
// inicializa el hidden total con los valores actuales de los inputs
recalcAndSetHiddenTotal();
