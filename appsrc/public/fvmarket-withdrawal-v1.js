(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const form = $('withdrawalForm');
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const lines = [
      'A la atención del titular de FVMarket:',
      'Comunico que desisto de la compra de los siguientes bienes:',
      'Productos y cantidad: ' + $('withdrawalGoods').value.trim(),
      $('withdrawalOrder').value.trim() ? 'Pedido o referencia: ' + $('withdrawalOrder').value.trim() : '',
      $('withdrawalReceived').value ? 'Fecha de recepción: ' + $('withdrawalReceived').value : '',
      'Nombre: ' + $('withdrawalName').value.trim(),
      'Domicilio: ' + $('withdrawalAddress').value.trim(),
      'Fecha de la comunicación: ' + new Date().toLocaleDateString('es-ES')
    ].filter(Boolean);
    const message = lines.join('\n');
    $('withdrawalMessage').value = message;
    $('withdrawalMail').href = 'mailto:' + $('withdrawalRecipient').dataset.email + '?subject=' + encodeURIComponent('FVMarket · Comunicación de desistimiento') + '&body=' + encodeURIComponent(message);
    $('withdrawalPrepared').hidden = false;
    $('withdrawalStatus').textContent = 'Mensaje preparado, aún no enviado. Envíalo desde tu correo y conserva una copia.';
  });
  $('withdrawalCopy').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('withdrawalMessage').value);
      $('withdrawalStatus').textContent = 'Mensaje copiado. Pégalo en tu correo y envíalo al destinatario indicado.';
    } catch {
      $('withdrawalMessage').focus(); $('withdrawalMessage').select();
      $('withdrawalStatus').textContent = 'Selecciona y copia el mensaje, y envíalo desde tu correo.';
    }
  };
})();
