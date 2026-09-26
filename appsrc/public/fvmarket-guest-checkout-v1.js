// FVM_GUEST_CHECKOUT_V1
(function () {
  'use strict';

  const el = id => document.getElementById(id);
  const money = value => Number(value || 0).toLocaleString('es-ES', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' €';
  let quoteContext = '';

  function loggedIn() {
    try { return typeof session !== 'undefined' && !!session; } catch { return !!window.session; }
  }

  function currentCart() {
    try { return Array.isArray(cart) ? cart : []; } catch { return []; }
  }

  function currentQuote() {
    try { return typeof rutaFVQuote !== 'undefined' ? rutaFVQuote : window.rutaFVQuote || null; } catch { return window.rutaFVQuote || null; }
  }

  function setQuote(value) {
    try { rutaFVQuote = value; } catch {}
    window.rutaFVQuote = value;
  }

  function readCustomer() {
    let user = {};
    try { user = session?.user || {}; } catch { user = window.session?.user || {}; }
    const billing = {
      name: (el('guestBillingName')?.value || user.billingName || '').trim(),
      nifNie: (el('guestNifNie')?.value || user.nifNie || '').trim(),
      address: (el('guestBillingAddress')?.value || user.billingAddress || '').trim(),
      city: (el('guestBillingCity')?.value || user.billingCity || '').trim(),
      postalCode: (el('guestBillingPostalCode')?.value || user.billingPostalCode || '').trim()
    };
    const customer = {
      name: (el('orderName')?.value || user.name || [user.firstName, user.lastName].filter(Boolean).join(' ')).trim(),
      email: (el('orderEmail')?.value || user.email || '').trim(),
      phone: (el('orderPhone')?.value || user.phone || '').trim(),
      address: (el('orderAddress')?.value || '').trim(),
      city: (el('orderCity')?.value || '').trim(),
      postalCode: (el('orderPostalCode')?.value || '').trim(),
      notes: (el('orderNotes')?.value || '').trim(),
      billingName: billing.name,
      nifNie: billing.nifNie,
      billingAddress: billing.address,
      billingCity: billing.city,
      billingPostalCode: billing.postalCode
    };
    return customer;
  }

  function contextKey() {
    const c = readCustomer();
    const items = currentCart().map(item => ({id: String(item.id || ''), qty: Math.max(1, Number(item.qty) || 1)})).sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify({email: c.email.toLowerCase(), address: c.address.toLowerCase(), city: c.city.toLowerCase(), postalCode: c.postalCode, items});
  }

  function anonymousOwnerKey() {
    const key = 'fvm_guest_checkout_id_v1';
    try {
      let value = sessionStorage.getItem(key) || '';
      if (!/^[A-Za-z0-9_-]{24,100}$/.test(value)) {
        const bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes);
        value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        sessionStorage.setItem(key, value);
      }
      return value;
    } catch {
      return Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
    }
  }

  function setMessage(message, kind = '') {
    const box = el('rutaFVQuoteBox');
    if (box) {
      box.style.display = 'block';
      box.className = 'routeQuote ' + kind;
      box.textContent = message;
    }
  }

  function clearQuote(message = '', refreshCart = true) {
    setQuote(null);
    quoteContext = '';
    const box = el('rutaFVQuoteBox');
    if (box) {
      box.style.display = message ? 'block' : 'none';
      box.className = 'routeQuote';
      box.textContent = message;
    }
    const button = el('fvmGuestTransportBtn');
    if (button) button.textContent = 'Ver coste de envío';
    if (refreshCart) window.renderCart?.();
  }

  function validateCustomer(c) {
    if (!c.name) return 'Introduce el nombre del cliente o de la empresa.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return 'Introduce un correo electrónico válido.';
    if (!c.phone) return 'Introduce un teléfono de contacto.';
    if (!c.address) return 'Introduce la dirección de entrega.';
    if (!c.city) return 'Introduce el municipio o localidad.';
    if (!c.postalCode) return 'Introduce el código postal.';
    return '';
  }

  function ensureCheckoutUi() {
    const checkout = el('cartCheckout');
    const box = checkout?.querySelector('.checkoutCustomer');
    if (!checkout || !box) return;
    box.classList.remove('anonymous');

    let notice = checkout.querySelector('.anonymousNotice');
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'anonymousNotice';
      checkout.insertBefore(notice, box);
    }
    if (notice.dataset.fvmGuestNotice !== 'v1' || !notice.innerHTML.includes('Compra como invitado')) {
      notice.innerHTML = '<b>Compra como invitado</b>No necesitas registrarte. Completa tus datos, calcula el transporte y elige cómo pagar.';
      notice.dataset.fvmGuestNotice = 'v1';
    }

    if (!el('fvmGuestBilling')) {
      const billing = document.createElement('details');
      billing.id = 'fvmGuestBilling';
      billing.className = 'fvmGuestBilling';
      billing.innerHTML = '<summary>Datos de facturación (opcional)</summary><p class="fvmGuestHelp">Si no indicas otros datos, utilizaremos el nombre y la dirección de entrega.</p><div class="field"><label for="guestBillingName">Nombre fiscal / empresa</label><input id="guestBillingName" autocomplete="organization" placeholder="Solo si es distinto"></div><div class="field"><label for="guestNifNie">NIF/NIE</label><input id="guestNifNie" autocomplete="off" placeholder="Opcional"></div><div class="field"><label for="guestBillingAddress">Dirección fiscal</label><input id="guestBillingAddress" autocomplete="street-address" placeholder="Solo si es distinta"></div><div class="checkout2"><div class="field"><label for="guestBillingCity">Municipio fiscal</label><input id="guestBillingCity" placeholder="Opcional"></div><div class="field"><label for="guestBillingPostalCode">Código postal fiscal</label><input id="guestBillingPostalCode" inputmode="numeric" placeholder="Opcional"></div></div>';
      box.appendChild(billing);
    }

    if (!el('fvmGuestTransportBtn')) {
      const transport = document.createElement('button');
      transport.id = 'fvmGuestTransportBtn';
      transport.type = 'button';
      transport.className = 'secondaryBtn fvmGuestTransportBtn';
      transport.textContent = 'Ver coste de envío';
      transport.addEventListener('click', () => window.calculateRutaFV?.());
      const createQuote = checkout.querySelector('button[onclick*="createQuote"]');
      checkout.insertBefore(transport, createQuote || checkout.querySelector('button[onclick*="checkoutStripe"]'));
    }

    if (!el('fvmGuestCheckoutStatus')) {
      const status = document.createElement('div');
      status.id = 'fvmGuestCheckoutStatus';
      status.className = 'fvmGuestCheckoutStatus';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const total = el('cartTotal');
      total?.insertAdjacentElement('afterend', status);
    }

    if (!document.getElementById('fvmGuestCheckoutStyle')) {
      const style = document.createElement('style');
      style.id = 'fvmGuestCheckoutStyle';
      style.textContent = '.anonymousNotice{display:block!important;background:#f1f8ed;border:1px solid #cfe7bf;border-radius:9px;padding:11px 12px;margin:8px 0 12px;font-size:11px;line-height:1.5;color:#355c22}.anonymousNotice b{display:block;font-size:13px;margin-bottom:3px;color:#24521b}.fvmGuestTransportBtn{width:100%;margin:0 0 8px}.fvmGuestBilling{margin:12px 0;padding:11px;border:1px solid #dbe5ed;border-radius:9px;background:#fff}.fvmGuestBilling summary{cursor:pointer;font-size:12px;font-weight:800;color:#06345f}.fvmGuestHelp{font-size:10px;color:#627489;line-height:1.4}.fvmGuestCheckoutStatus{display:none;margin:10px 0;padding:12px;border-radius:9px;background:#edf8e7;border:1px solid #cfe7bf;color:#315b20;font-size:12px;line-height:1.45}.fvmGuestCheckoutStatus.show{display:block}.fvmGuestCheckoutStatus.error{background:#fff4f2;border-color:#ffd5cc;color:#8b281b}';
      document.head.appendChild(style);
    }
  }

  function captureCheckoutFields() {
    const values = {};
    ['orderName','orderEmail','orderPhone','orderAddress','orderCity','orderPostalCode','orderNotes','guestBillingName','guestNifNie','guestBillingAddress','guestBillingCity','guestBillingPostalCode'].forEach(id => {
      const input = el(id);
      if (input) values[id] = input.value;
    });
    return values;
  }

  function restoreCheckoutFields(values) {
    Object.entries(values).forEach(([id, value]) => {
      const input = el(id);
      if (input && input.value !== value) input.value = value;
    });
  }

  function clearCheckoutFields() {
    ['orderName','orderEmail','orderPhone','orderAddress','orderCity','orderPostalCode','orderNotes','guestBillingName','guestNifNie','guestBillingAddress','guestBillingCity','guestBillingPostalCode'].forEach(id => {
      const input = el(id);
      if (input) input.value = '';
    });
  }

  function bindAddressInputs() {
    ['orderEmail','orderAddress','orderCity','orderPostalCode'].forEach(id => {
      const input = el(id);
      if (!input || input.dataset.fvmGuestBound) return;
      input.dataset.fvmGuestBound = '1';
      input.addEventListener('input', () => {
        if (currentQuote()) clearQuote('Los datos cambiaron. Vuelve a calcular el transporte antes de pagar.');
      });
    });
  }

  async function calculateGuestTransport() {
    if (loggedIn()) return originalCalculate ? originalCalculate.apply(this, arguments) : false;
    ensureCheckoutUi();
    const items = currentCart();
    if (!items.length) { setMessage('Añade al menos un producto al carrito.', 'error'); return false; }
    const customer = readCustomer();
    const validationError = validateCustomer(customer);
    if (validationError) { setMessage(validationError, 'error'); return false; }
    if (window.fvmGuestTransportPending) return window.fvmGuestTransportPending;

    const button = el('fvmGuestTransportBtn');
    if (button) { button.disabled = true; button.textContent = 'Calculando transporte…'; }
    setMessage('Calculando el transporte a tu obra con RutaFV…', 'loading');
    const request = (async () => {
      try {
        const quote = await api('/api/rutafv/quote', {
          method: 'POST',
          body: JSON.stringify({items: items.map(item => ({id:item.id,qty:item.qty})),customer,guestCheckoutId:anonymousOwnerKey(),deliveryMode:'normal',express:false})
        });
        setQuote(quote);
        quoteContext = contextKey();
        setMessage('Transporte a tu obra: ' + money(quote.amount ?? quote.total) + '. El total del carrito ya incluye este importe.', 'ok');
        window.renderCart?.();
        return true;
      } catch (error) {
        setQuote(null);
        quoteContext = '';
        const text = Number(error?.status) === 429 ? 'RutaFV está temporalmente ocupado. Espera unos segundos e inténtalo de nuevo.' : (error.message || 'No se pudo calcular el transporte.');
        window.renderCart?.();
        setMessage(text, 'error');
        return false;
      } finally {
        window.fvmGuestTransportPending = null;
        if (button) { button.disabled = false; button.textContent = currentQuote() ? 'Actualizar coste de envío' : 'Ver coste de envío'; }
      }
    })();
    window.fvmGuestTransportPending = request;
    return request;
  }

  const originalCalculate = window.calculateRutaFV;
  const originalTransfer = window.placeTransfer;
  const originalStripe = window.checkoutStripe;
  const originalCreateQuote = window.createQuote;
  const originalRender = window.renderCart;
  const originalOpenCart = window.openCart;
  const originalSelectAddress = window.selectDeliveryAddress;

  window.deliveryCustomer = readCustomer;
  window.calculateRutaFV = calculateGuestTransport;
  window.toggleRutaFV = calculateGuestTransport;

  window.renderCart = function (...args) {
    const fields = captureCheckoutFields();
    const before = currentQuote();
    if (before && quoteContext && quoteContext !== contextKey()) clearQuote('', false);
    const result = originalRender?.apply(this, args);
    if (!loggedIn()) restoreCheckoutFields(fields);
    ensureCheckoutUi();
    bindAddressInputs();
    const button = el('fvmGuestTransportBtn');
    if (button) button.textContent = currentQuote() ? 'Actualizar coste de envío' : 'Ver coste de envío';
    const status = el('fvmGuestCheckoutStatus');
    if (currentCart().length && status) status.classList.remove('show');
    return result;
  };

  window.openCart = function (...args) {
    if (!loggedIn()) {
      ['guestBillingName','guestNifNie','guestBillingAddress','guestBillingCity','guestBillingPostalCode'].forEach(id => { if (el(id)) el(id).value = ''; });
      const status = el('fvmGuestCheckoutStatus');
      status?.classList.remove('show','error');
      if (status) status.textContent = '';
    }
    const result = originalOpenCart?.apply(this, args);
    ensureCheckoutUi();
    bindAddressInputs();
    return result;
  };

  window.selectDeliveryAddress = function (...args) {
    const result = originalSelectAddress?.apply(this, args);
    if (!loggedIn()) setTimeout(() => window.calculateRutaFV?.(), 120);
    return result;
  };

  window.createQuote = async function (...args) {
    if (loggedIn() && originalCreateQuote) return originalCreateQuote.apply(this, args);
    const message = el('cartMsg');
    if (message) message.textContent = 'Para guardar y consultar presupuestos en Mi cuenta, inicia sesión o crea una cuenta. La compra directa como invitado sigue disponible.';
  };

  function showStatus(message, error = false) {
    ensureCheckoutUi();
    const status = el('fvmGuestCheckoutStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.add('show');
    status.classList.toggle('error', error);
  }

  async function prepareGuestOrder(paymentMethod) {
    const customer = readCustomer();
    const validationError = validateCustomer(customer);
    if (validationError) { setMessage(validationError, 'error'); return null; }
    if (customer.nifNie && !/^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/.test(customer.nifNie.toUpperCase().replace(/[\s-]/g,''))) {
      setMessage('El NIF/NIE indicado no tiene un formato válido.', 'error');
      return null;
    }
    if (!currentQuote() || quoteContext !== contextKey()) {
      const calculated = await calculateGuestTransport();
      if (!calculated || !currentQuote()) return null;
    }
    const items = currentCart();
    if (!items.length) { setMessage('El carrito está vacío.', 'error'); return null; }
    const body = {items:items.map(item=>({id:item.id,qty:item.qty})),customer,guestCheckoutId:anonymousOwnerKey(),useRutaFV:true,rutaFVQuote:currentQuote(),paymentMethod};
    return body;
  }

  window.placeTransfer = async function (...args) {
    if (loggedIn() && originalTransfer) return originalTransfer.apply(this, args);
    try {
      const body = await prepareGuestOrder('transfer');
      if (!body) return;
      const button = document.querySelector('#cartCheckout button[onclick*="placeTransfer"]');
      if (button) { button.disabled = true; button.textContent = 'Creando pedido…'; }
      const order = await api('/api/guest/orders', {method:'POST',body:JSON.stringify(body)});
      const email = body.customer.email;
      try { if (typeof clearCart === 'function') clearCart(); else { cart = []; localStorage.removeItem('fv_cart'); } } catch {}
      clearCheckoutFields();
      showStatus(`Pedido ${order.number} creado. Está pendiente de transferencia. Hemos enviado la confirmación a ${email}.`);
      const msg = el('cartMsg');
      if (msg) msg.textContent = '';
    } catch (error) {
      setMessage(error.message || 'No se pudo crear el pedido.', 'error');
    } finally {
      const button = document.querySelector('#cartCheckout button[onclick*="placeTransfer"]');
      if (button) { button.disabled = false; button.textContent = 'Pedido por transferencia'; }
    }
  };

  window.checkoutStripe = async function (...args) {
    if (loggedIn() && originalStripe) return originalStripe.apply(this, args);
    try {
      const body = await prepareGuestOrder('stripe');
      if (!body) return;
      const button = document.querySelector('#cartCheckout button[onclick*="checkoutStripe"]');
      if (button) { button.disabled = true; button.textContent = 'Conectando con el pago…'; }
      const result = await api('/api/guest/checkout/stripe', {method:'POST',body:JSON.stringify(body)});
      window.location.href = result.url;
    } catch (error) {
      setMessage(error.message || 'No se pudo iniciar el pago.', 'error');
    } finally {
      const button = document.querySelector('#cartCheckout button[onclick*="checkoutStripe"]');
      if (button) { button.disabled = false; button.textContent = 'Pagar online con tarjeta'; }
    }
  };

  function initialize() {
    ensureCheckoutUi();
    bindAddressInputs();
    const observer = new MutationObserver(() => {
      ensureCheckoutUi();
      bindAddressInputs();
    });
    const checkout = el('cartCheckout');
    if (checkout) observer.observe(checkout, {childList:true,subtree:true});
    if (typeof window.renderCart === 'function') window.renderCart();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {once:true});
  else initialize();
})();
