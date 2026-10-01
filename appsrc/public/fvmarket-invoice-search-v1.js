(() => {
  'use strict';
  const normal = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
  window.fvmFilterInvoices = function () {
    const host = document.getElementById('invoices'), input = document.getElementById('fvmInvoiceSearch');
    if (!host || !input) return;
    const query = normal(input.value), compact = query.replace(/[^a-z0-9]/g,'');
    const rows = [...host.querySelectorAll('tr')].filter(row => !row.querySelector('.empty') && !row.dataset.invoiceSearchEmpty);
    let matches = 0;
    rows.forEach(row => {
      const value = normal(row.textContent);
      row.hidden = !!query && !value.includes(query) && (!compact || !value.replace(/[^a-z0-9]/g,'').includes(compact));
      if (!row.hidden) matches++;
    });
    host.querySelector('[data-invoice-search-empty]')?.remove();
    if (rows.length && !matches) {
      const row = document.createElement('tr'); row.dataset.invoiceSearchEmpty = '1';
      row.innerHTML = '<td colspan="9" class="empty">No hay facturas que coincidan con la búsqueda.</td>'; host.appendChild(row);
    }
    const count = document.getElementById('fvmInvoiceSearchCount');
    if (count) count.textContent = matches + ' de ' + rows.length + ' facturas';
  };
  document.getElementById('fvmInvoiceSearch')?.addEventListener('input',window.fvmFilterInvoices);
  window.fvmFilterInvoices();
})();
