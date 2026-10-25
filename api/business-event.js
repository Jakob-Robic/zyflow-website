const { getSupabase } = require('./_lib/supabase');
const { guardRequest, jsonBody } = require('./_lib/security');

/**
 * Anonymous attribution from the "Open in Zyflow" landing (/o/...): a guest tapped a
 * store badge. Stored through record_business_event (no IP, no user, no device id).
 * Only store_redirect is accepted here; the app records its own events.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SURFACES = new Set(['embed', 'hosted', 'qr']);

function deviceFrom(ua) {
  const s = String(ua || '');
  if (/iPad|Tablet/i.test(s)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(s)) return 'mobile';
  return 'desktop';
}

module.exports = async function handler(req, res) {
  if (!(await guardRequest(req, res, 'business-event'))) return;

  const body = jsonBody(req) || {};
  const slug = typeof body.slug === 'string' ? body.slug.toLowerCase() : '';
  if (body.event !== 'store_redirect' || slug.length > 64 || !SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'Invalid event' });
  }

  const { error } = await getSupabase().rpc('record_business_event', {
    p_slug: slug,
    p_event: 'store_redirect',
    p_surface: SURFACES.has(body.surface) ? body.surface : null,
    p_route_id: typeof body.routeId === 'string' && UUID_RE.test(body.routeId) ? body.routeId : null,
    p_stop_poi_id: null,
    p_lang: typeof body.lang === 'string' && /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(body.lang) ? body.lang : null,
    p_device: deviceFrom(req.headers && req.headers['user-agent']),
  });

  if (error) {
    console.error('business-event API: rpc failed:', error.code || 'error');
    return res.status(500).json({ error: 'Failed to record' });
  }
  return res.status(204).end();
};
