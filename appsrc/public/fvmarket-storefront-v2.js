// FVM_STOREFRONT_SESSION_CART_ADDRESS_V2
(function () {
  const $ = id => document.getElementById(id);
  const clean = value => String(value || '').trim();
  const installStyle = () => {
    if ($('fvmStorefrontV2Style')) return;
    const style = document.createElement('style');
    style.id = 'fvmStorefrontV2Style';
    style.textContent = `
      .v5hero::after{content:'⚒  ⚙  ▧  ⌁  ◈  ⚒  ⚙  ▧  ⌁  ◈';position:absolute;inset:auto -30px 14px 0;color:#fff;opacity:.09;font-size:58px;letter-spacing:24px;white-space:nowrap;pointer-events:none;transform:rotate(-7deg);z-index:1;text-shadow:0 2px 0 #001b32}
      .v5heroText,.heroTradeCollage{z-index:2}
      #cartCheckout .checkoutCustomer.anonymous{display:none!important}
      #cartCheckout .anonymousNotice{display:block;background:#f7f9fc;border:1px solid #dfe7ee;border-radius:9px;padding:10px;margin:10px 0;color:#48617b;font-size:11px}
      #cartCheckout .anonymousNotice b{display:block;color:var(--navy);font-size:12px;margin-bottom:3px}
      #cartCheckout .fvmTransportSpinner{display:inline-block;width:16px;height:16px;border:2px solid #cfe0ef;border-top-color:var(--green);border-radius:50%;animation:fvmSpin .75s linear infinite;vertical-align:-3px;margin-right:7px}
      @keyframes fvmSpin{to{transform:rotate(360deg)}}
      .fvmAccountShell{grid-template-columns:180px minmax(0,1fr)!important}
      .fvmAccountNav{position:sticky;top:0}
      @media(max-width:650px){.fvmAccountShell{grid-template-columns:1fr!important}.fvmAccountNav{position:static}}
    `;
    document.head.appendChild(style);
  };
  function clearCustomer() {
    ['orderName','orderEmail','orderPhone','orderAddress','orderCity','orderPostalCode','orderNotes'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    window.fvmDeliveryAddressVerified = false;
    try { if (typeof rutaFVQuote !== 'undefined') rutaFVQuote = null; } catch {}
  }
  function setAnonymousCartState() {
    const checkout = $('cartCheckout');
    const box = checkout?.querySelector('.checkoutCustomer');
    if (!checkout || !box) return;
    const anonymous = !session;
    box.classList.toggle('anonymous', anonymous);
    let notice = checkout.querySelector('.anonymousNotice');
    if (anonymous) {
      clearCustomer();
      if (!notice) { notice = document.createElement('div'); notice.className = 'anonymousNotice'; checkout.insertBefore(notice, box); }
      notice.innerHTML = '<b>Carrito preparado</b>Inicia sesión para completar los datos de entrega y pagar. Tus datos no se muestran mientras navegas sin sesión.';
    } else if (notice) notice.remove();
    checkout.querySelectorAll('button').forEach(button => {
      const text = clean(button.textContent).toLowerCase();
      if (/recalcular|calcular transporte/.test(text)) button.remove();
    });
  }
  function fillCustomerWithoutAddress() {
    const u = session?.user || {};
    const name = $('orderName'), email = $('orderEmail'), phone = $('orderPhone');
    if (name && !name.value) name.value = u.name || [u.firstName, u.lastName].filter(Boolean).join(' ');
    if (email && !email.value) email.value = u.email || '';
    if (phone && !phone.value) phone.value = u.phone || '';
    ['orderAddress','orderCity','orderPostalCode'].forEach(id => { const el = $(id); if (el) el.value = ''; });
    window.fvmDeliveryAddressVerified = false;
  }
  function bindAddressVerification() {
    ['orderAddress','orderCity','orderPostalCode'].forEach(id => {
      const input = $(id); if (!input || input.dataset.fvmAddressV2) return;
      input.dataset.fvmAddressV2 = '1';
      input.addEventListener('input', () => {
        window.fvmDeliveryAddressVerified = false;
        try { if (typeof rutaFVQuote !== 'undefined') rutaFVQuote = null; } catch {}
        const box = $('rutaFVQuoteBox'); if (box) { box.textContent = ''; box.style.display = 'none'; }
        if (id === 'orderAddress') {
          clearTimeout(window.fvmAddressSearchTimer);
          window.fvmAddressSearchTimer = setTimeout(() => { if (typeof searchDeliveryAddress === 'function') searchDeliveryAddress(); }, 350);
        }
      });
    });
  }
  function autoQuoteIfAddressSelected() {
    if (!session || !window.fvmDeliveryAddressVerified || !cart?.length) return;
    clearTimeout(window.fvmAutoQuoteTimer);
    window.fvmAutoQuoteTimer = setTimeout(() => {
      if (typeof calculateRutaFV === 'function' && !window.fvmRutaFVInFlight) calculateRutaFV();
    }, 300);
  }
  function hideCalculateButtons() {
    const checkout = $('cartCheckout'); if (!checkout) return;
    checkout.querySelectorAll('button').forEach(button => { if (/recalcular|calcular transporte/i.test(clean(button.textContent))) button.remove(); });
  }
  installStyle();
  // A storefront page always begins without a customer session. Admin keeps its own gate in sessionStorage.
  try { localStorage.removeItem('fv_session'); } catch {}
  try { session = null; } catch { window.session = null; }
  window.fvmDeliveryAddressVerified = false;
  try {
    window.fillCheckoutCustomer = fillCustomerWithoutAddress;
    fillCheckoutCustomer = fillCustomerWithoutAddress;
  } catch {}
  try {
    window.deliveryCustomer = function () {
      const u = session?.user || {};
      return { name: clean($('orderName')?.value || u.name || [u.firstName, u.lastName].filter(Boolean).join(' ')), email: clean($('orderEmail')?.value || u.email), phone: clean($('orderPhone')?.value || u.phone), address: clean($('orderAddress')?.value), city: clean($('orderCity')?.value), postalCode: clean($('orderPostalCode')?.value), notes: clean($('orderNotes')?.value) };
    };
    deliveryCustomer = window.deliveryCustomer;
  } catch {}
  try {
    const originalSelect = window.selectDeliveryAddress;
    window.selectDeliveryAddress = function (index) {
      if (typeof originalSelect === 'function') originalSelect(index);
      window.fvmDeliveryAddressVerified = true;
      bindAddressVerification();
      autoQuoteIfAddressSelected();
    };
    selectDeliveryAddress = window.selectDeliveryAddress;
  } catch {}
  try {
    const originalRender = window.renderCart;
    window.renderCart = function () { if (typeof originalRender === 'function') originalRender(); setAnonymousCartState(); hideCalculateButtons(); bindAddressVerification(); };
    renderCart = window.renderCart;
  } catch {}
  try {
    const originalOpen = window.openCart;
    window.openCart = function () { if (session) fillCustomerWithoutAddress(); else clearCustomer(); if (typeof originalOpen === 'function') originalOpen(); setAnonymousCartState(); hideCalculateButtons(); bindAddressVerification(); };
    openCart = window.openCart;
  } catch {}
  try {
    const originalRefresh = window.refreshAccount;
    window.refreshAccount = function () { const result = originalRefresh?.apply(this, arguments); setTimeout(() => { if (session) fillCustomerWithoutAddress(); else clearCustomer(); setAnonymousCartState(); }, 0); return result; };
    refreshAccount = window.refreshAccount;
  } catch {}
  try {
    const originalLogout = window.logout;
    window.logout = function () { clearCustomer(); originalLogout?.apply(this, arguments); setAnonymousCartState(); };
    logout = window.logout;
  } catch {}
  const observer = new MutationObserver(() => { setAnonymousCartState(); hideCalculateButtons(); bindAddressVerification(); });
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', event => {
    if (event.target.closest('#addressSuggestions .addressSuggestion')) setTimeout(autoQuoteIfAddressSelected, 80);
  });
  setTimeout(() => { clearCustomer(); setAnonymousCartState(); bindAddressVerification(); hideCalculateButtons(); }, 0);
})();
