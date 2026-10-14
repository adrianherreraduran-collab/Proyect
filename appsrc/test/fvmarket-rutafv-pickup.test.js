'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { registerProcurementRoutes } = require('../procurement_v2');

function routeHarness() {
  const routes = new Map();
  const app = {
    get(path, ...handlers) { routes.set('GET ' + path, handlers); },
    post(path, ...handlers) { routes.set('POST ' + path, handlers); }
  };
  const order = {
    id: 'order-1',
    number: 'FV-100',
    status: 'en_compra_proveedor',
    paidAt: '2026-10-11T09:00:00.000Z',
    customer: { name: 'Cliente de prueba' },
    items: [{ productId: 'product-1', title: 'Inodoro', qty: 1, procurement: { supplierId: 'cofemax', provider: 'Cofemax', status: 'comprada' } }],
    transport: { requested: true }
  };
  const task = {
    id: 'task-1',
    orderId: order.id,
    supplierId: 'cofemax',
    supplierName: 'Cofemax',
    supplierAddress: 'Calle del Proveedor 12',
    supplierCity: 'Puerto del Rosario',
    status: 'comprada',
    items: [{ productId: 'product-1', title: 'Inodoro', qty: 1 }]
  };
  const data = { orders: [order], procurementTasks: [task], suppliers: [], products: [], notifications: [] };
  let created = 0;
  registerProcurementRoutes(app, {
    read: () => data,
    save: () => {},
    ordersManager: (_req, _res, next) => next?.(),
    transitionOrder: (_d, value, status) => { value.status = status; return { ok: true, changed: true, to: status }; },
    ensureLedgerForOrder: () => {},
    createRutaFVDelivery: async (_d, value) => {
      created += 1;
      value.transport.deliveryId = 'RF-ORDER-1';
      value.status = 'enviado_a_rutafv';
      return { id: 'RF-ORDER-1' };
    },
    paidOrderStatus: status => ['pagado', 'en_compra_proveedor', 'mercancia_recogida', 'listo_para_rutafv', 'enviado_a_rutafv'].includes(String(status)),
    isStoredDeliveredOrder: () => false,
    customerOrderState: value => ({ key: value.status })
  });
  const handlers = routes.get('POST /api/admin/orders/:id/procurement-action');
  assert.ok(handlers, 'procurement action route is registered');
  const handler = handlers.at(-1);
  async function call(action) {
    const res = {
      code: 200,
      body: null,
      status(code) { this.code = code; return this; },
      json(value) { this.body = value; return this; }
    };
    await handler({ params: { id: order.id }, body: { action }, user: { id: 'admin', name: 'Admin', role: 'admin' } }, res);
    return res;
  }
  return { data, order, task, created: () => created, call };
}

test('RutaFV delivery can be created after supplier readiness and scan remains the pickup confirmation', async () => {
  const ctx = routeHarness();

  const tooEarly = await ctx.call('enviar_a_rutafv');
  assert.equal(tooEarly.code, 409);
  assert.match(tooEarly.body.error, /proveedor tiene preparada/i);
  assert.equal(ctx.created(), 0);

  const ready = await ctx.call('listo_para_recogida');
  assert.equal(ready.code, 200);
  assert.equal(ctx.task.status, 'lista_para_recogida');
  assert.equal(ctx.order.status, 'en_compra_proveedor');
  assert.equal(ctx.order.fulfillment.pickupStatus, 'pendiente');

  const sent = await ctx.call('enviar_a_rutafv');
  assert.equal(sent.code, 200);
  assert.equal(ctx.created(), 1);
  assert.equal(ctx.order.status, 'enviado_a_rutafv');
  assert.equal(ctx.order.transport.deliveryId, 'RF-ORDER-1');
  assert.equal(ctx.task.status, 'lista_para_recogida', 'sending to RutaFV must not mark the goods as physically collected');
});
