// FVM_ACCOUNTING_ANALYTIC_UI_V2
// One fiscal ledger, separate analytic views for FVMarket and RutaFV.
(() => {
  if (window.__fvmAccountingV2) return;
  window.__fvmAccountingV2 = true;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = value => Number(value || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const typeLabels = { venta_productos: 'Venta de productos', transporte_cobrado: 'Transporte cobrado', coste_proveedor: 'Coste de proveedor', reembolso: 'Reembolso' };
  const appLabels = { FVMarket: 'FVMarket', RutaFV: 'RutaFV', Compartido: 'Compartido' };
  let report = null;

  function addStyles() {
    if ($('fvmAccountingV2Styles')) return;
    const style = document.createElement('style');
    style.id = 'fvmAccountingV2Styles';
    style.textContent = `
      .fvmAccFilters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:12px;background:#f6f9fb;border:1px solid var(--line);border-radius:10px;margin:10px 0 14px}
      .fvmAccFilters label{font-size:10px;font-weight:900;color:var(--muted)}
      .fvmAccFilters input,.fvmAccFilters select{display:block;width:100%;margin-top:4px;padding:8px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink)}
      .fvmAccCards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
      .fvmAccCard{border:1px solid var(--line);border-radius:10px;padding:12px;background:#fff;box-shadow:0 4px 14px rgba(3,52,95,.05)}
      .fvmAccCard b{display:block;font-size:20px;color:var(--navy)}.fvmAccCard small{color:var(--muted);font-weight:850}.fvmAccCard.fvmAccCost b{color:#a72c2c}.fvmAccCard.fvmAccRuta{border-color:#cfe5b9;background:#f8fcf4}
      .fvmAccTable{overflow:auto;border:1px solid var(--line);border-radius:9px}.fvmAccTable table{min-width:1120px}.fvmAccApp{display:inline-block;padding:4px 7px;border-radius:999px;font-size:10px;font-weight:900;background:#edf3f8;color:var(--navy)}.fvmAccApp.ruta{background:#edf8e7;color:#397820}
      .fvmAccAmount.pos{color:#397a21;font-weight:900}.fvmAccAmount.neg{color:#a72c2c;font-weight:900}.fvmAccHelp{font-size:11px;color:var(--muted);margin:4px 0 0}.fvmAccAudit{margin-top:16px;border-top:1px solid var(--line);padding-top:10px}.fvmAccAuditRow{padding:7px 9px;border-left:3px solid var(--lime);background:#f8fbfd;border-radius:0 7px 7px 0;margin:6px 0;font-size:11px}
      @media(max-width:900px){.fvmAccFilters{grid-template-columns:1fr 1fr}.fvmAccCards{grid-template-columns:1fr 1fr}}
      @media(max-width:560px){.fvmAccFilters,.fvmAccCards{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function queryString() {
    const params = new URLSearchParams();
    [['from', 'fvmAccFrom'], ['to', 'fvmAccTo'], ['app', 'fvmAccAppFilter'], ['type', 'fvmAccTypeFilter'], ['status', 'fvmAccStatusFilter'], ['q', 'fvmAccSearch']].forEach(([key, id]) => {
      const value = String($(id)?.value || '').trim();
      if (value) params.set(key, value);
    });
    return params.toString();
  }

  function renderCards(totals = {}) {
    const apps = totals.byApp || {};
    const fvm = apps.FVMarket || { income: 0, costs: 0, net: 0 };
    const ruta = apps.RutaFV || { income: 0, costs: 0, net: 0 };
    const cards = [
      ['fvmAccCard', money(fvm.income), 'FVMarket · ventas y otros ingresos'],
      ['fvmAccCard fvmAccCost', money(fvm.costs), 'FVMarket · compras a proveedores'],
      ['fvmAccCard fvmAccRuta', money(ruta.income), 'RutaFV · transporte cobrado'],
      ['fvmAccCard', money(fvm.net), 'Resultado analítico FVMarket'],
      ['fvmAccCard fvmAccRuta', money(ruta.net), 'Resultado analítico RutaFV'],
      ['fvmAccCard', money(totals.net), 'Resultado consolidado']
    ];
    $('fvmAccCards').innerHTML = cards.map(([cls, value, label]) => `<div class="${cls}"><b>${value}</b><small>${label}</small></div>`).join('');
  }

  function renderRows(rows = []) {
    const body = rows.map(row => {
      const amount = Number(row.amount || 0);
      const appClass = row.analyticApp === 'RutaFV' ? 'ruta' : '';
      const thirdParty = row.supplierName || row.customerName || '—';
      const doc = row.invoiceNumber || row.orderNumber || row.orderId || '—';
      return `<tr><td>${esc(new Date(row.at || Date.now()).toLocaleString('es-ES'))}</td><td><span class="fvmAccApp ${appClass}">${esc(appLabels[row.analyticApp] || row.analyticApp)}</span></td><td><b>${esc(row.orderNumber || row.orderId || '—')}</b><br><small>${esc(row.invoiceNumber ? `Factura ${row.invoiceNumber}` : 'Sin factura asociada')}</small></td><td>${esc(row.accountLabel || typeLabels[row.type] || row.type)}</td><td>${esc(thirdParty)}</td><td>${esc(doc)}</td><td class="fvmAccAmount ${amount >= 0 ? 'pos' : 'neg'}">${money(amount)}</td></tr>`;
    }).join('');
    $('fvmAccRows').innerHTML = body || '<tr><td colspan="7" class="empty">No hay movimientos para los filtros seleccionados.</td></tr>';
  }

  function renderAudit(rows = []) {
    const host = $('fvmAccAuditList');
    if (!host) return;
    host.innerHTML = rows.slice(0, 25).map(row => `<div class="fvmAccAuditRow"><b>${esc(row.action || 'Movimiento')}</b> · ${esc(row.actor?.name || 'Sistema')}<br><small>${esc(new Date(row.at || Date.now()).toLocaleString('es-ES'))} · ${esc(row.note || '')}</small></div>`).join('') || '<div class="empty">No hay movimientos registrados.</div>';
  }

  function fillFilters(data) {
    const app = $('fvmAccAppFilter');
    const type = $('fvmAccTypeFilter');
    const status = $('fvmAccStatusFilter');
    if (app && !app.dataset.ready) {
      app.innerHTML = '<option value="">Todas las aplicaciones</option>' + (data.applications || []).map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
      app.dataset.ready = '1';
    }
    if (type && !type.dataset.ready) {
      type.innerHTML = '<option value="">Todos los conceptos</option>' + (data.types || []).map(x => `<option value="${esc(x)}">${esc(typeLabels[x] || x)}</option>`).join('');
      type.dataset.ready = '1';
    }
    if (status && !status.dataset.ready) {
      status.innerHTML = '<option value="">Todos los estados</option>' + (data.statuses || []).map(x => `<option value="${esc(x)}">${esc(x.replaceAll('_', ' '))}</option>`).join('');
      status.dataset.ready = '1';
    }
  }

  function render(data) {
    report = data || {};
    fillFilters(report);
    renderCards(report.totals || {});
    renderRows(report.entries || []);
    renderAudit(report.audit || []);
    const count = $('fvmAccCount');
    if (count) count.textContent = `${Number(report.totals?.entries || 0)} movimientos`;
  }

  async function load() {
    const host = $('fvmAccRows');
    if (!host || typeof window.api !== 'function') return;
    host.innerHTML = '<tr><td colspan="7" class="empty">Cargando contabilidad…</td></tr>';
    try {
      const suffix = queryString();
      render(await window.api('/api/admin/accounting' + (suffix ? `?${suffix}` : '')));
    } catch (error) {
      host.innerHTML = `<tr><td colspan="7"><div class="notice">${esc(error.message || 'No se pudo cargar la contabilidad.')}</div></td></tr>`;
    }
  }

  async function downloadHolded() {
    const stored = JSON.parse(localStorage.getItem('fv_session') || 'null');
    const suffix = queryString();
    const response = await fetch('/api/admin/accounting/export' + (suffix ? `?${suffix}` : ''), { headers: { Authorization: `Bearer ${stored?.token || ''}` } });
    if (!response.ok) {
      let message = 'No se pudo generar la exportación.';
      try { const data = await response.json(); message = data.error || message; } catch {}
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `fvmarket-holded-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function mount() {
    addStyles();
    const nav = document.querySelector('.navin');
    const panel = $('panel');
    if (!nav || !panel) return;
    if (!nav.querySelector('[data-view="accounting"]')) {
      const tab = document.createElement('button');
      tab.className = 'tab'; tab.dataset.view = 'accounting'; tab.textContent = '▣ Contabilidad';
      try {
        const saved = JSON.parse(localStorage.getItem('fv_session') || 'null');
        if (!['admin', 'orders_manager'].includes(saved?.user?.role)) tab.style.display = 'none';
      } catch { tab.style.display = 'none'; }
      nav.appendChild(tab);
    }
    if (!$('view-accounting')) {
      const section = document.createElement('section'); section.className = 'view'; section.id = 'view-accounting';
      section.innerHTML = `<div class="card"><div class="bar"><div><h2>Contabilidad FVMarket / RutaFV</h2><p class="sub">Una contabilidad fiscal común con resultados analíticos separados por aplicación y trazabilidad hasta el pedido, proveedor y factura.</p></div><button class="btn navy" id="fvmAccRefresh" type="button" title="Actualizar ahora" aria-label="Actualizar ahora">↻</button></div><div class="fvmAccFilters"><label>Desde<input id="fvmAccFrom" type="date"></label><label>Hasta<input id="fvmAccTo" type="date"></label><label>Aplicación<select id="fvmAccAppFilter"></select></label><label>Concepto<select id="fvmAccTypeFilter"></select></label><label>Estado del pedido<select id="fvmAccStatusFilter"></select></label><label>Buscar<input id="fvmAccSearch" placeholder="Pedido, factura, cliente o proveedor"></label><div class="bar" style="align-items:end"><button class="btn ghost" id="fvmAccClear" type="button">Limpiar filtros</button><button class="btn navy" id="fvmAccExport" type="button">Exportar para Holded</button></div><span class="fvmAccHelp">La exportación genera un CSV de movimientos con debe, haber, aplicación, tercero, pedido, factura e IGIC para revisarlo o importarlo en Holded.</span></div><div id="fvmAccCards" class="fvmAccCards"></div><div class="bar"><b id="fvmAccCount">0 movimientos</b><span class="msg">Los presupuestos pendientes de pago no se incluyen.</span></div><div class="fvmAccTable"><table><thead><tr><th>Fecha</th><th>Aplicación</th><th>Pedido / factura</th><th>Concepto</th><th>Tercero</th><th>Documento</th><th>Importe</th></tr></thead><tbody id="fvmAccRows"></tbody></table></div><div class="fvmAccAudit"><button class="btn ghost" id="fvmAccAuditToggle" type="button" aria-expanded="false">▸ Ver trazabilidad de movimientos</button><div id="fvmAccAuditList" hidden></div></div></div>`;
      panel.appendChild(section);
    }
    const tab = nav.querySelector('[data-view="accounting"]');
    if (tab.dataset.bound !== '1') {
      tab.dataset.bound = '1';
      tab.onclick = () => {
        document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active', item === tab));
        document.querySelectorAll('.view').forEach(item => item.classList.toggle('active', item.id === 'view-accounting'));
        load();
      };
    }
    ['fvmAccFrom', 'fvmAccTo', 'fvmAccAppFilter', 'fvmAccTypeFilter', 'fvmAccStatusFilter'].forEach(id => $(id)?.addEventListener('change', load));
    $('fvmAccSearch')?.addEventListener('input', (() => { let timer; return () => { clearTimeout(timer); timer = setTimeout(load, 250); }; })());
    $('fvmAccRefresh')?.addEventListener('click', load);
    $('fvmAccClear')?.addEventListener('click', () => { ['fvmAccFrom', 'fvmAccTo', 'fvmAccAppFilter', 'fvmAccTypeFilter', 'fvmAccStatusFilter', 'fvmAccSearch'].forEach(id => { if ($(id)) $(id).value = ''; }); load(); });
    $('fvmAccExport')?.addEventListener('click', async () => { const button = $('fvmAccExport'); button.disabled = true; try { await downloadHolded(); } catch (error) { alert(error.message); } finally { button.disabled = false; } });
    $('fvmAccAuditToggle')?.addEventListener('click', () => { const button = $('fvmAccAuditToggle'); const list = $('fvmAccAuditList'); const open = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(open)); button.textContent = (open ? '▾' : '▸') + ' Ver trazabilidad de movimientos'; list.hidden = !open; });
    window.fvmAccountingRefresh = load;
    if (document.querySelector('#view-accounting.active')) load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 50));
  else setTimeout(mount, 50);
})();
