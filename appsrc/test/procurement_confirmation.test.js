'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/fvmarket-admin-control-v2.js'), 'utf8');

function harness(apiError) {
  const requests = [], dialogs = [], nodes = new Map();
  const card = { dataset: { orderId: 'ord_test' }, children: [], querySelector(selector) {
    if (selector === 'header b') return { textContent: 'FVM-TEST & control' };
    return this.children.find(node => node.className === 'fvmSendError') || null;
  }, appendChild(node) { this.children.push(node); node.remove = () => { this.children = this.children.filter(x => x !== node); }; } };
  const input = () => ({ checked: true, disabled: false, isConnected: true, closest: () => card, focus() {} });
  const control = input();
  function button() { const listeners = {}; return { addEventListener: (event, handler) => { listeners[event] = handler; }, focus() {}, click: () => listeners.click() }; }
  const document = {
    readyState: 'loading', addEventListener() {}, getElementById: id => nodes.get(id) || null,
    querySelectorAll: () => [card],
    body: { appendChild(node) { nodes.set(node.id, node); } },
    createElement(tag) {
      if (tag !== 'dialog') return { setAttribute(name, value) { this[name] = value; } };
      const approve = button(), cancel = button(), listeners = {};
      const dialog = { open: false, setAttribute(name, value) { this[name] = value; },
        querySelector: selector => selector === '.fvmSendApprove' ? approve : cancel,
        addEventListener: (event, handler) => { listeners[event] = handler; },
        showModal() { this.open = true; }, close() { this.open = false; listeners.close?.(); },
        remove() { nodes.delete(this.id); },
        approve, cancel, escape() { let prevented = false; listeners.cancel({ preventDefault() { prevented = true; } }); return prevented; }
      };
      dialogs.push(dialog); return dialog;
    }
  };
  const window = {};
  vm.runInNewContext(source, { window, document, setInterval() { return 1; }, clearInterval() {}, setTimeout() {},
    confirm() { throw Error('La confirmación nativa no debe usarse para enviar'); },
    alert() { throw Error('Los errores de envío deben ser visibles en el panel'); },
    api: async (url, options) => { requests.push({ url, body: JSON.parse(options.body), method: options.method }); if (apiError) throw Error(apiError); return {}; }
  });
  return { window, control, card, requests, dialogs, input };
}

test('el envío espera confirmación visible e identifica el pedido; cancelar no crea un reparto', async () => {
  const h = harness();
  const pending = h.window.fvmChecklistAction('ord_test', 'enviar_a_rutafv', h.control);
  assert.equal(h.requests.length, 0);
  assert.equal(h.control.disabled, true);
  assert.equal(h.control.checked, false);
  assert.match(h.dialogs[0].innerHTML, /FVM-TEST &amp; control/);
  assert.equal(h.dialogs[0]['aria-labelledby'], 'fvmRutaFVSendTitle');
  h.dialogs[0].cancel.click(); await pending;
  assert.equal(h.requests.length, 0);
  assert.equal(h.control.disabled, false);
  assert.equal(h.dialogs[0].open, false);
});

test('Escape cancela la confirmación sin enviar el pedido', async () => {
  const h = harness();
  const pending = h.window.fvmChecklistAction('ord_test', 'enviar_a_rutafv', h.control);
  assert.equal(h.dialogs[0].escape(), true);
  await pending;
  assert.equal(h.requests.length, 0);
  assert.equal(h.control.disabled, false);
});

test('confirmar crea una sola solicitud aunque haya doble clic o se vuelva a activar el control', async () => {
  const h = harness();
  const pending = h.window.fvmChecklistAction('ord_test', 'enviar_a_rutafv', h.control);
  const duplicateInput = h.input();
  await h.window.fvmChecklistAction('ord_test', 'enviar_a_rutafv', duplicateInput);
  assert.equal(h.dialogs.length, 1);
  assert.equal(duplicateInput.checked, false);
  h.dialogs[0].approve.click(); h.dialogs[0].approve.click(); await pending;
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, '/api/admin/orders/ord_test/procurement-action');
  assert.equal(h.requests[0].method, 'POST');
  assert.equal(h.requests[0].body.action, 'enviar_a_rutafv');
  assert.equal(h.control.disabled, false);
});

test('un fallo de RutaFV aparece en el pedido y permite reintentar sin marcarlo como enviado', async () => {
  const h = harness('RutaFV no está disponible');
  let pending = h.window.fvmChecklistAction('ord_test', 'enviar_a_rutafv', h.control);
  h.dialogs[0].approve.click(); await pending;
  const notice = h.card.querySelector('.fvmSendError');
  assert.equal(notice.role, 'alert');
  assert.match(notice.textContent, /RutaFV no está disponible/);
  assert.equal(h.control.checked, false);
  assert.equal(h.control.disabled, false);
  h.control.checked = true;
  pending = h.window.fvmChecklistAction('ord_test', 'enviar_a_rutafv', h.control);
  assert.equal(h.card.querySelector('.fvmSendError'), null);
  h.dialogs[1].cancel.click(); await pending;
  assert.equal(h.requests.length, 1);
});
