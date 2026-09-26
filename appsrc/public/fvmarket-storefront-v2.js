// FVM_STOREFRONT_GUEST_CHECKOUT_V3
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const clean = value => String(value || '').trim();
  const money = value => Number(value || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

  function installStyle() {
    if ($('fvmStorefrontV3Style')) return;
    const style = document.createElement('style');
    style.id = 'fvmStorefrontV3Style';
    style.textContent = `
      .guestCheckoutHint{margin:-2px 0 12px;color:#48617b;font-size:11px}
      .billingTitle{margin-top:18px!important;padding-top:14px;border-top:1px solid #e1e8ee}
      .checkoutConsent{display:flex;align-items:flex-start;gap:8px;margin:10px 0;font-size:11px;line-height:1.4;color:#33465d}
      .checkoutConsent input{width:17px;height:17px;flex:0 0 auto;margin-top:0}
      .checkoutConsent a{color:#06345f;font-weight:800}
      .securePaymentNote{text-align:center;color:#60748a;font-size:10px;line-height:1.45;margin:2px 0 8px}
      .fvmTransportSpinner{display:inline-block;width:16px;height:16px;border:2px solid #cfe0ef;border-top-color:#82c341;border-radius:50%;animation:fvmSpin .75s linear infinite;vertical-align:-3px;margin-right:7px}
      @keyframes fvmSpin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
  }

  function fillFromAccount() {
    const user = session?.user;
    if (!user) return;
    const address = user.deliveryAddress || {};
    const values = {
      orderName: user.name || [user.firstName, user.lastName].filter(Boolean).join(' '),
      orderEmail: user.email,
      orderPhone: user.phone,
      orderAddress: address.address,
      orderCity: address.city,
      orderPostalCode: address.postalCode,
      orderBillingName: user.billingName || user.name,
      orderNif: user.nifNie,
      orderBillingAddress: user.billingAddress,
      orderBillingCity: user.billingCity,
      orderBillingPostalCode: user.billingPostalCode
    };
    Object.entries(values).forEach(([id, value]) => { const input = $(id); if (input && !input.value && value) input.value = value; });
  }

  function customer() {
    const user = session?.user || {};
    const address = clean($('orderAddress')?.value);
    const city = clean($('orderCity')?.value);
    const postalCode = clean($('orderPostalCode')?.value);
    const name = clean($('orderName')?.value || user.name || [user.firstName, user.lastName].filter(Boolean).join(' '));
    return {
      name,
      email: clean($('orderEmail')?.value || user.email),
      phone: clean($('orderPhone')?.value || user.phone),
      address,
      city,
      postalCode,
      notes: clean($('orderNotes')?.value),
      billingName: clean($('orderBillingName')?.value || user.billingName || name),
      nifNie: clean($('orderNif')?.value || user.nifNie),
      billingAddress: clean($('orderBillingAddress')?.value || user.billingAddress || address),
      billingCity: clean($('orderBillingCity')?.value || user.billingCity || city),
      billingPostalCode: clean($('orderBillingPostalCode')?.value || user.billingPostalCode || postalCode)
    };
  }

  function deliveryError(value, contactRequired = true) {
    if (contactRequired && !value.name) return 'Introduce el nombre del cliente.';
    if (contactRequired && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return 'Introduce un correo electrónico válido.';
    if (contactRequired && value.phone.replace(/\D/g, '').length < 7) return 'Introduce un teléfono válido.';
    if (!value.address) return 'Introduce la dirección de entrega.';
    if (!value.city) return 'Introduce el municipio o localidad.';
    if (!/^\d{5}$/.test(value.postalCode)) return 'Introduce un código postal válido.';
    if (contactRequired && (!value.billingAddress || !value.billingCity || !/^\d{5}$/.test(value.billingPostalCode))) return 'Completa los datos de facturación.';
    return '';
  }

  function syncCheckoutState() {
    const quoteButton = document.querySelector('.accountQuoteButton');
    if (quoteButton) quoteButton.style.display = session?.user?.profileComplete ? '' : 'none';
    const hint = document.querySelector('.guestCheckoutHint');
    if (hint) hint.textContent = session ? 'Tus datos se han precargado; puedes cambiarlos para este pedido.' : 'Puedes comprar directamente, sin crear una cuenta.';
  }

  async function calculateTransport() {
    const box = $('rutaFVQuoteBox');
    if (window.fvmRutaFVInFlight) return window.fvmRutaFVInFlight;
    if (!Array.isArray(cart) || !cart.length) return false;
    const value = customer(), error = deliveryError(value, false);
    if (error) {
      if (box) { box.style.display = 'block'; box.className = 'routeQuote error'; box.textContent = error; }
      return false;
    }
    if (box) { box.style.display = 'block'; box.className = 'routeQuote loading'; box.innerHTML = '<span class="fvmTransportSpinner"></span>Calculando el transporte con RutaFV…'; }
    const pending = requestRutaFVQuote({ items: cart, customer: value, address: value.address, city: value.city, postalCode: value.postalCode, phone: value.phone, notes: value.notes, deliveryMode: 'normal', express: false })
      .then(quote => { rutaFVQuote = quote; if (box) { box.className = 'routeQuote ok'; box.textContent = 'Transporte calculado: ' + money(quote.amount ?? quote.total); box.style.display = 'block'; } renderCart(); return true; })
      .catch(error => { rutaFVQuote = null; if (box) { box.style.display = 'block'; box.className = 'routeQuote error'; box.textContent = error.message || 'No se pudo calcular el transporte.'; } renderCart(); return false; })
      .finally(() => { window.fvmRutaFVInFlight = null; });
    window.fvmRutaFVInFlight = pending;
    return pending;
  }

  async function payWithStripe() {
    const message = $('cartMsg'), value = customer(), error = deliveryError(value, true);
    if (error) { if (message) message.textContent = error; return; }
    if (!$('orderTerms')?.checked || !$('orderPrivacy')?.checked) { if (message) message.textContent = 'Acepta las condiciones de compra y la política de privacidad.'; return; }
    if (!rutaFVQuote && !await calculateTransport()) return;
    if (message) message.textContent = 'Abriendo el pago seguro de Stripe…';
    try {
      const result = await api('/api/checkout/stripe', { method: 'POST', body: JSON.stringify({ items: cart, customer: value, useRutaFV: true, rutaFVQuote, termsAccepted: true, privacyAccepted: true, guestSessionId }) });
      if (!result.url) throw new Error('Stripe no devolvió el enlace de pago.');
      window.location.assign(result.url);
    } catch (error) { if (message) message.textContent = error.message; }
  }

  function toast(text, ok = true) {
    const node = document.createElement('div'); node.className = 'fvmPaymentToast'; node.textContent = text;
    if (!ok) node.style.background = '#9b2c2c'; document.body.appendChild(node); setTimeout(() => node.remove(), 8000);
  }

  async function handlePaymentReturn() {
    const params = new URLSearchParams(window.location.search), state = params.get('payment');
    if (!['return', 'cancel'].includes(state)) return;
    if (state === 'cancel') { toast('Pago cancelado. Tu carrito sigue preparado.', false); window.history.replaceState({}, document.title, window.location.pathname); return; }
    const query = new URLSearchParams({ order: params.get('order') || '', session_id: params.get('session_id') || '', access: params.get('access') || '' });
    try {
      const result = await api('/api/payments/stripe/status?' + query.toString());
      if (!result.paid) throw new Error('El pago aún se está confirmando. Recibirás la confirmación por correo.');
      clearCart(); toast('Pago confirmado. Pedido ' + result.orderNumber + ' recibido correctamente.');
    } catch (error) { toast(error.message || 'Estamos verificando el pago con Stripe.', false); }
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  function bind() {
    installStyle(); fillFromAccount(); syncCheckoutState();
    ['orderAddress', 'orderCity', 'orderPostalCode'].forEach(id => {
      const input = $(id); if (!input || input.dataset.fvmGuestBound) return; input.dataset.fvmGuestBound = '1';
      input.addEventListener('input', () => { rutaFVQuote = null; clearTimeout(window.fvmGuestQuoteTimer); window.fvmGuestQuoteTimer = setTimeout(calculateTransport, 550); });
    });
  }

  window.deliveryCustomer = customer;
  try { deliveryCustomer = customer; } catch {}
  window.calculateRutaFV = calculateTransport;
  try { calculateRutaFV = calculateTransport; } catch {}
  window.checkoutStripe = payWithStripe;
  try { checkoutStripe = payWithStripe; } catch {}

  const baseOpenCart = window.openCart;
  window.openCart = function () { fillFromAccount(); baseOpenCart?.apply(this, arguments); bind(); };
  try { openCart = window.openCart; } catch {}
  const baseRenderCart = window.renderCart;
  window.renderCart = function () { baseRenderCart?.apply(this, arguments); syncCheckoutState(); };
  try { renderCart = window.renderCart; } catch {}
  const baseRefreshAccount = window.refreshAccount;
  window.refreshAccount = function () { const result = baseRefreshAccount?.apply(this, arguments); setTimeout(() => { fillFromAccount(); syncCheckoutState(); }, 0); return result; };
  try { refreshAccount = window.refreshAccount; } catch {}
  const baseSelectAddress = window.selectDeliveryAddress;
  window.selectDeliveryAddress = function () { baseSelectAddress?.apply(this, arguments); setTimeout(calculateTransport, 80); };
  try { selectDeliveryAddress = window.selectDeliveryAddress; } catch {}

  window.quickRutaFVQuote = async function () {
    const message = $('quickShipMsg'), address = clean($('quickShipAddress')?.value), city = clean($('quickShipCity')?.value), postalCode = clean($('quickShipPostal')?.value);
    if (!cart?.length) { message.textContent = 'Añade al menos un producto al carrito.'; return; }
    if (!address || !city || !/^\d{5}$/.test(postalCode)) { message.textContent = 'Completa dirección, municipio y código postal.'; return; }
    message.innerHTML = '<span class="fvmTransportSpinner"></span>Calculando transporte…';
    try { const quote = await requestRutaFVQuote({ items: cart, customer: {}, address, city, postalCode, deliveryMode: 'normal', express: false }); message.textContent = 'Envío a tu obra: ' + money(quote.amount ?? quote.total) + '.'; }
    catch (error) { message.textContent = error.message; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { bind(); handlePaymentReturn(); });
  else { bind(); handlePaymentReturn(); }
  setTimeout(bind, 500);
})();
