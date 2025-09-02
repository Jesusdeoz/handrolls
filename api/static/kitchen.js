async function fetchEstado(estado) {
  const res = await fetch(`/api/orders?estado=${estado}`);
  return await res.json();
}

function cardSoloLectura(p, estadoColumna) {
  // rojo para despachados/entregados/retirados, verde para el resto
  const isDone = ['despachado', 'entregado', 'retirado'].includes(
    (p.estado || estadoColumna || '').toLowerCase()
  );
  const cls = isDone ? 'order-done' : 'order-current';

  return `
    <div class="card card-order ${cls}" style="margin:8px 0">
      <strong>#${p.id}</strong> — ${p.cliente_nombre} <small>(${p.modalidad})</small><br>
      <em>${p.detalle}</em><br>
      Salsas: ${p.salsas || '-'}<br>
      <small>Creado: ${p.hora_creacion}</small>
    </div>
  `;
}

async function render() {
  try {
    const nuevo = await fetchEstado('nuevo');
    const prep  = await fetchEstado('en_preparacion');
    const listo = await fetchEstado('listo');
    const desp  = await fetchEstado('despachado');

    document.getElementById('c_nuevo').textContent = nuevo.length;
    document.getElementById('c_prep').textContent  = prep.length;
    document.getElementById('c_listo').textContent = listo.length;
    document.getElementById('c_desp').textContent  = desp.length;

    document.getElementById('col_nuevo').innerHTML = nuevo.map(p => cardSoloLectura(p, 'nuevo')).join('');
    document.getElementById('col_prep').innerHTML  = prep.map(p => cardSoloLectura(p, 'en_preparacion')).join('');
    document.getElementById('col_listo').innerHTML = listo.map(p => cardSoloLectura(p, 'listo')).join('');
    document.getElementById('col_desp').innerHTML  = desp.map(p => cardSoloLectura(p, 'despachado')).join('');
  } catch (e) {
    console.error('Error render()', e);
  }
}

render();
setInterval(render, 4000);
