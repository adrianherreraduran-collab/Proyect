'use strict';

const STATUSES = new Set(['pending', 'approved', 'rejected']);
const COLLECTIONS = { product: 'reviews', experience: 'orderReviews' };

function isApproved(review = {}) {
  return review.status === 'approved' && !!review.reviewedAt && review.reviewedBy?.role === 'admin';
}

function ensureModeration(d) {
  for (const collection of Object.values(COLLECTIONS)) {
    if (!Array.isArray(d[collection])) d[collection] = [];
    for (const review of d[collection]) {
      // Las opiniones publicadas antes de la moderación también necesitan revisión.
      if (!STATUSES.has(review.status) || (review.status === 'approved' && !isApproved(review))) {
        review.status = review.status === 'hidden' ? 'rejected' : 'pending';
      }
    }
  }
  return d;
}

function ownReview(review = {}) {
  return {id: review.id, rating: review.rating, comment: review.comment, authorName: review.authorName, createdAt: review.createdAt, status: review.status, rejectionReason: review.status === 'rejected' ? String(review.rejectionReason || '') : ''};
}

function adminReviews(d) {
  ensureModeration(d);
  return Object.entries(COLLECTIONS).flatMap(([kind, collection]) => d[collection].map(review => {
    const order = (d.orders || []).find(o => o.id === review.orderId);
    const product = (d.products || []).find(p => p.id === review.productId);
    return {...ownReview(review), kind, orderNumber: order?.number || '', productTitle: product?.title || '', reviewedAt: review.reviewedAt || '', reviewedBy: review.reviewedBy || null};
  })).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function registerRoutes(app, {read, save, admin}) {
  app.get('/api/admin/reviews', admin, (req, res) => {
    const rows = adminReviews(read());
    const status = String(req.query?.status || 'pending');
    if (status !== 'all' && !STATUSES.has(status)) return res.status(400).json({error: 'Estado de opinión no válido'});
    const counts = Object.fromEntries([...STATUSES].map(key => [key, rows.filter(row => row.status === key).length]));
    res.json({counts, reviews: status === 'all' ? rows : rows.filter(row => row.status === status)});
  });

  app.patch('/api/admin/reviews/:kind/:id', admin, (req, res) => {
    // Defensa adicional: las decisiones solo se aceptan de un administrador.
    if (req.user?.role !== 'admin') return res.status(403).json({error: 'Solo el administrador puede moderar opiniones'});
    const collection = COLLECTIONS[req.params.kind];
    const action = String(req.body?.action || '');
    if (!collection || !['approve', 'reject'].includes(action)) return res.status(400).json({error: 'Decisión de moderación no válida'});
    const reason = String(req.body?.reason || '').trim();
    if (reason.length > 500) return res.status(400).json({error: 'El motivo no puede superar 500 caracteres'});
    const d = ensureModeration(read());
    const review = d[collection].find(row => String(row.id) === String(req.params.id));
    if (!review) return res.status(404).json({error: 'Opinión no encontrada'});
    const status = action === 'approve' ? 'approved' : 'rejected';
    const previous = review.status;
    if (previous !== status) {
      review.status = status;
      review.reviewedAt = new Date().toISOString();
      review.reviewedBy = {id: String(req.user.id), name: String(req.user.name || req.user.username || 'Administrador'), role: 'admin'};
      review.rejectionReason = action === 'reject' ? reason : '';
      if (!Array.isArray(d.auditLog)) d.auditLog = [];
      d.auditLog.push({id: 'aud_review_' + review.id + '_' + Date.now(), action: 'opinion_' + action, reviewId: review.id, kind: req.params.kind, fromStatus: previous, toStatus: status, actor: review.reviewedBy, at: review.reviewedAt});
      save(d);
    }
    res.json({ok: true, review: ownReview(review)});
  });
}

module.exports = {isApproved, ensureModeration, ownReview, adminReviews, registerRoutes};
