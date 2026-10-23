'use strict';
(function (root) {
  const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
  const write = (storage, key, value) => { try { storage.setItem(key, value); } catch {} };
  const remove = (storage, key) => { try { storage.removeItem(key); } catch {} };
  function json(value, fallback) { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } }
  function validSession(value, now = Date.now()) {
    if (!value || typeof value.token !== 'string' || !value.token || !value.user || typeof value.user.id !== 'string' || !value.user.id) return false;
    try {
      const parts = value.token.split('.');
      if (parts.length !== 3) return false;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return Number.isFinite(payload.exp) && payload.exp * 1000 > now;
    } catch { return false; }
  }
  function normalizeCart(value) {
    const rows = new Map();
    if (!Array.isArray(value)) return [];
    for (const row of value.slice(0, 500)) {
      if (!row || typeof row.id !== 'string' || !row.id || row.id.length > 160) continue;
      const qty = Math.floor(Number(row.qty));
      if (!Number.isFinite(qty) || qty < 1) continue;
      rows.set(row.id, Math.min(99, (rows.get(row.id) || 0) + qty));
    }
    return [...rows].map(([id, qty]) => ({ id, qty }));
  }
  function clear(storage) {
    const session = json(read(storage, 'fv_session'), null);
    if (session?.user?.id) remove(storage, `fv_cart_user:${session.user.id}`);
    ['fv_session', 'fv_cart', 'fv_cart_owner', 'fv_checkout_pending'].forEach(key => remove(storage, key));
  }
  function cartForUser(storage, userId, allowLegacy = false) {
    const id = String(userId || '');
    if (!id) return [];
    const key = `fv_cart_user:${id}`;
    const saved = read(storage, key);
    if (saved !== null) return normalizeCart(json(saved, []));
    const owner = read(storage, 'fv_cart_owner');
    if (owner !== id && !(allowLegacy && owner === null)) return [];
    const legacy = normalizeCart(json(read(storage, 'fv_cart'), []));
    write(storage, key, JSON.stringify(legacy));
    return legacy;
  }
  function forgetSession(storage) {
    remove(storage, 'fv_session');
  }
  function restore(storage, now = Date.now()) {
    const session = json(read(storage, 'fv_session'), null);
    if (!validSession(session, now)) { forgetSession(storage); return { session: null, cart: [] }; }
    const cart = cartForUser(storage, session.user.id, true);
    save(storage, session, cart);
    return { session, cart };
  }
  function save(storage, session, cart) {
    if (!session?.user?.id) return;
    const normalized = normalizeCart(cart);
    write(storage, 'fv_session', JSON.stringify(session));
    write(storage, 'fv_cart', JSON.stringify(normalized));
    write(storage, 'fv_cart_owner', String(session.user.id));
    write(storage, `fv_cart_user:${session.user.id}`, JSON.stringify(normalized));
  }
  function saveCheckout(storage, session, orderId, cart) {
    if (!session?.user?.id || !orderId) return;
    write(storage, 'fv_checkout_pending', JSON.stringify({ userId: session.user.id, orderId, items: normalizeCart(cart) }));
  }
  function finishCheckout(storage, session, orderId, cart) {
    const pending = json(read(storage, 'fv_checkout_pending'), null);
    if (!pending || pending.userId !== session?.user?.id || pending.orderId !== orderId) return null;
    const purchased = new Map(normalizeCart(pending.items).map(x => [x.id, x.qty]));
    const remaining = normalizeCart(cart).map(x => ({ id: x.id, qty: x.qty - (purchased.get(x.id) || 0) })).filter(x => x.qty > 0);
    remove(storage, 'fv_checkout_pending'); save(storage, session, remaining);
    return remaining;
  }
  function pendingCheckout(storage, session) {
    const pending = json(read(storage, 'fv_checkout_pending'), null);
    return pending?.userId === session?.user?.id ? pending : null;
  }
  const state = { pendingCheckout, restore, save, clear, forgetSession, cartForUser, normalizeCart, validSession, saveCheckout, finishCheckout };
  root.FVMStoreState = state;
  if (typeof module !== 'undefined' && module.exports) module.exports = state;
})(typeof window !== 'undefined' ? window : globalThis);

