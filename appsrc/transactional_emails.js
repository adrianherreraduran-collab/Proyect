'use strict';

function esc(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function money(value) {
  return `${Number(value || 0).toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2})} €`;
}

function date(value) {
  if (!value) return 'Pendiente de planificación';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString('es-ES');
}

function customerName(order = {}) {
  return String(order.customer?.name || order.customer?.billingName || 'cliente').trim();
}

function orderItems(order = {}) {
  const rows = (order.items || []).map(item => `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #e8eef3">${esc(item.title || item.ref || 'Producto')}<br><small style="color:#64748b">${esc(item.ref || '')}</small></td>
    <td style="padding:8px 0;border-bottom:1px solid #e8eef3;text-align:center">${Number(item.qty || 1)}</td>
    <td style="padding:8px 0;border-bottom:1px solid #e8eef3;text-align:right">${money(item.lineTotal)}</td>
  </tr>`).join('');
  const delivery = Number(order.delivery || 0) > 0 ? `<tr>
    <td colspan="2" style="padding:8px 0;text-align:right">Envío a tu obra</td>
    <td style="padding:8px 0;text-align:right">${money(order.delivery)}</td>
  </tr>` : '';
  return `<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px">
    <thead><tr><th style="text-align:left;padding:8px 0;color:#48617b">Producto</th><th style="padding:8px 0;color:#48617b">Ud.</th><th style="text-align:right;padding:8px 0;color:#48617b">Importe</th></tr></thead>
    <tbody>${rows}${delivery}</tbody>
  </table>`;
}

function layout({title, intro, order, body, button}) {
  const buttonHtml = button ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#06345f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">${esc(button.label)}</a></p>` : '';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#eef3f7;font-family:Arial,sans-serif;color:#10233f">
    <div style="max-width:640px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 24px rgba(16,35,63,.12)">
      <div style="padding:22px 28px;background:linear-gradient(110deg,#06345f,#82c341);color:#fff"><div style="font-size:26px;font-weight:900">FV<span style="color:#dff3c7">Market</span></div><div style="margin-top:5px;opacity:.9">Tu compra, clara y segura</div></div>
      <div style="padding:28px"><p style="margin-top:0">Hola ${esc(customerName(order))},</p><h1 style="font-size:22px;color:#06345f;margin:0 0 10px">${esc(title)}</h1><p>${esc(intro)}</p>
        ${body || ''}${buttonHtml}
        <p style="font-size:12px;color:#64748b;margin-bottom:0">Pedido <b>${esc(order.number || '')}</b> · Total <b>${money(order.total)}</b></p>
      </div>
    </div>
  </body></html>`;
}

function orderReceived(order) {
  const text = `Hemos recibido tu pedido ${order.number}. Queda pendiente de pago por transferencia.`;
  return {
    subject: `Hemos recibido tu pedido ${order.number} · FVMarket`,
    text,
    html: layout({title: 'Pedido recibido', intro: text, order, body: orderItems(order)})
  };
}

function orderConfirmation(order, invoiceUrl = '') {
  const text = `Tu pago del pedido ${order.number} se ha confirmado. Total: ${money(order.total)}.`;
  return {
    subject: `Pedido confirmado ${order.number} · FVMarket`,
    text,
    html: layout({title: 'Pedido confirmado', intro: `${text} Ya podemos iniciar la preparación y coordinación de la entrega.`, order, body: orderItems(order), button: invoiceUrl ? {url: invoiceUrl, label: 'Ver factura'} : null})
  };
}

function invoice(order, invoiceData, invoiceUrl = '') {
  const text = `Factura ${invoiceData.number} correspondiente al pedido ${order.number}. Total: ${money(invoiceData.total)}.`;
  const body = `<p><b>Factura ${esc(invoiceData.number)}</b></p>${orderItems(order)}<p style="text-align:right;font-size:18px"><b>Total: ${money(invoiceData.total)}</b></p>`;
  return {
    subject: `Factura ${invoiceData.number} · FVMarket`,
    text,
    html: layout({title: 'Factura emitida', intro: text, order, body, button: invoiceUrl ? {url: invoiceUrl, label: 'Ver / imprimir factura'} : null})
  };
}

function delivery(order, status = 'en_reparto') {
  const completed = status === 'entregado';
  const title = completed ? 'Pedido entregado' : 'Tu pedido está en camino';
  const intro = completed
    ? `Te confirmamos que el pedido ${order.number} ha sido marcado como entregado.`
    : `El pedido ${order.number} ya está en reparto. La fecha prevista es ${date(order.deliveryDate || order.transport?.estimatedDeliveryDate)}.`;
  return {
    subject: `${title}: ${order.number} · FVMarket`,
    text: intro,
    html: layout({title, intro, order, body: orderItems(order)})
  };
}

function refund(order, refundData = {}) {
  const amount = Number(refundData.amount || 0);
  const text = `Hemos iniciado un reembolso de ${money(amount)} para el pedido ${order.number}. Se devolverá al mismo método de pago utilizado.`;
  return {
    subject: `Reembolso de ${order.number} · FVMarket`,
    text,
    html: layout({title: 'Reembolso iniciado', intro: text, order, body: `<div style="background:#f2f8ec;border:1px solid #c9e3b9;border-radius:8px;padding:14px"><b>Importe reembolsado: ${money(amount)}</b><br><span style="color:#48617b">El abono se realizará en el mismo método de pago. Las entidades financieras pueden tardar algunos días en reflejarlo.</span></div>`})
  };
}

module.exports = {orderReceived, orderConfirmation, invoice, delivery, refund};
