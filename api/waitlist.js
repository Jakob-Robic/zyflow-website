const { sendBrevoEmail } = require('./brevo');
const { getSupabase } = require('./_lib/supabase');
const {
  escapeHtml,
  jsonBody,
  readWaitlistFields,
  guardRequest,
  rejectIfBot,
  enforceEmailRateLimit,
} = require('./_lib/security');

if (!process.env.SUPABASE_URL) console.error('Missing SUPABASE_URL');
if (!process.env.SUPABASE_SERVICE_KEY) console.error('Missing SUPABASE_SERVICE_KEY');
if (!process.env.BREVO_API_KEY) console.error('Missing BREVO_API_KEY');
if (!process.env.NOTIFICATION_EMAIL) console.error('Missing NOTIFICATION_EMAIL');

module.exports = async function handler(req, res) {
  if (!(await guardRequest(req, res, 'waitlist'))) return;

  try {
    const body = jsonBody(req);
    if (!(await enforceEmailRateLimit(res, 'waitlist', body && body.email))) return;
    if (await rejectIfBot(req, res, body)) return;

    const fields = readWaitlistFields(body);
    if (fields.error) {
      console.error('Waitlist API: validation failed —', fields.error);
      return res.status(400).json({ error: fields.error });
    }

    const { email } = fields;

    const { error } = await getSupabase()
      .from('waitlist')
      .insert({ email, signed_up_at: new Date().toISOString() });

    if (error && error.code !== '23505') {
      console.error('Waitlist API: Supabase insert failed:', error.code || 'error');
      return res.status(500).json({ error: 'Failed to save' });
    }

    if (!process.env.NOTIFICATION_EMAIL) {
      console.error('Waitlist API: skipping email — NOTIFICATION_EMAIL not set');
    } else if (!process.env.BREVO_API_KEY) {
      console.error('Waitlist API: skipping email — BREVO_API_KEY not set');
    } else {
      try {
        await sendBrevoEmail({
          to: process.env.NOTIFICATION_EMAIL,
          subject: '🚀 New Waitlist Signup',
          html: `<p>New waitlist signup:</p><p><strong>${escapeHtml(email)}</strong></p>`,
        });
      } catch (emailError) {
        console.error('Waitlist API: Brevo send failed:', emailError && emailError.message);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Waitlist API: unhandled error:', err && err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
