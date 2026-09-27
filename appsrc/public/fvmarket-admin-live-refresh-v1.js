// FVM_ADMIN_LIVE_REFRESH_V1
(() => {
  if (window.__fvmAdminLiveRefreshV1) return;
  window.__fvmAdminLiveRefreshV1 = true;

  const $ = id => document.getElementById(id);
  const refreshSelector = [
    'button[onclick*="loadProducts"]',
    'button[onclick*="loadAdminQuotes"]',
    'button[onclick*="loadInvoices"]',
    '#fvmPendingOrdersRefresh',
    '#fvmBoardRefresh',
    '#fvmNotificationsRefresh'
  ].join(',');

  function addStyles() {
    if ($('fvmAdminLiveRefreshStyle')) return;
    const style = document.createElement('style');
    style.id = 'fvmAdminLiveRefreshStyle';
    style.textContent = `
      .bar{align-items:center;flex-wrap:wrap}
      .fvmRefreshButton{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:36px;border:1px solid #cfe0ef!important;border-radius:999px!important;padding:7px 13px!important;background:linear-gradient(135deg,#06345f,#0b5b91)!important;color:#fff!important;font-size:11px;font-weight:900;box-shadow:0 5px 14px rgba(3,52,95,.18);transition:transform .15s ease,box-shadow .15s ease,filter .15s ease}
      .fvmRefreshButton:hover{transform:translateY(-1px);filter:brightness(1.08);box-shadow:0 8px 18px rgba(3,52,95,.24)}
      .fvmRefreshButton:active{transform:translateY(0);box-shadow:0 3px 8px rgba(3,52,95,.16)}
      .fvmRefreshButton:disabled{opacity:.65;cursor:wait;transform:none}
      .fvmRefreshIcon{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#ffffff24;font-size:16px;line-height:1}
      .fvmAutoStatus{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border:1px solid #cfe7bf;border-radius:999px;background:#edf8e7;color:#397820;font-size:10px;font-weight:850;white-space:nowrap}
      .fvmAutoStatus:before{content:'●';color:#5fa92f;font-size:10px}
      .fvmSettingsLayout{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start;margin-bottom:18px}
      .fvmSettingsLayout>.card{max-width:none!important;margin:0!important}
      @media(max-width:980px){.fvmSettingsLayout{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function styleRefreshButtons() {
    document.querySelectorAll(refreshSelector).forEach(button => {
      if (button.dataset.fvmRefreshStyled === '1') return;
      button.dataset.fvmRefreshStyled = '1';
      button.type = 'button';
      button.title = 'Actualizar ahora';
      button.setAttribute('aria-label', 'Actualizar ahora');
      button.classList.add('fvmRefreshButton');
      button.innerHTML = '<span class="fvmRefreshIcon" aria-hidden="true">↻</span><span>Actualizar ahora</span>';
      addAutoStatus(button);
    });
  }

  function addAutoStatus(button) {
    const bar = button.closest('.bar');
    if (!bar || bar.querySelector('.fvmAutoStatus')) return;
    const status = document.createElement('span');
    status.className = 'fvmAutoStatus';
    status.title = 'Este panel se actualiza automáticamente cada 30 segundos';
    status.textContent = 'Actualización automática · 30 s';
    bar.insertBefore(status, button);
  }

  function arrangeSettings() {
    const view = $('view-settings');
    const config = $('deliveryBase')?.closest('.card');
    const security = $('fvmAdminSecurityV14');
    if (!view || !config || !security) return;
    let layout = $('fvmSettingsLayout');
    if (!layout) {
      layout = document.createElement('div');
      layout.id = 'fvmSettingsLayout';
      layout.className = 'fvmSettingsLayout';
      view.insertBefore(layout, config);
    }
    if (config.parentElement !== layout) layout.appendChild(config);
    if (security.parentElement !== layout) layout.appendChild(security);
  }

  function activeView() {
    return document.querySelector('#panel .view.active');
  }

  async function refreshActivePanels() {
    if (document.hidden || $('panel')?.style.display !== 'block') return;
    const view = activeView();
    if (!view) return;
    try {
      if (view.id === 'view-products' && typeof window.loadProducts === 'function') {
        await window.loadProducts();
      } else if (view.id === 'view-orders') {
        if (typeof window.loadOrders === 'function') await window.loadOrders();
        if (typeof window.loadAdminQuotes === 'function') await window.loadAdminQuotes();
      } else if (view.id === 'view-invoices' && typeof window.loadInvoices === 'function') {
        await window.loadInvoices();
      } else if (view.id === 'view-control') {
        $('fvmBoardRefresh')?.click();
      } else if (view.id === 'view-notifications') {
        $('fvmNotificationsRefresh')?.click();
      }
    } catch (error) {
      console.warn('FVMarket admin: actualización automática no disponible', error);
    }
  }

  function start() {
    addStyles();
    styleRefreshButtons();
    arrangeSettings();
    const panel = $('panel');
    if (panel && !window.__fvmAdminLiveRefreshObserver) {
      const observer = new MutationObserver(() => {
        styleRefreshButtons();
        arrangeSettings();
      });
      observer.observe(panel, { childList: true, subtree: true });
      window.__fvmAdminLiveRefreshObserver = observer;
    }
    if (!window.__fvmAdminLiveRefreshTimer) {
      window.__fvmAdminLiveRefreshTimer = setInterval(refreshActivePanels, 30000);
    }
  }

  window.fvmAdminAutoRefreshNow = refreshActivePanels;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshActivePanels();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(start, 300));
  } else {
    setTimeout(start, 300);
  }
})();
