const { sendBrevoEmail } = require('./brevo');
const { getSupabase } = require('./_lib/supabase');
const {
  escapeHtml,
  stripCrlf,
  jsonBody,
  readContactFields,
  guardRequest,
  rejectIfBot,
  enforceEmailRateLimit,
} = require('./_lib/security');

if (!process.env.SUPABASE_URL) console.error('Missing SUPABASE_URL');
if (!process.env.SUPABASE_SERVICE_KEY) console.error('Missing SUPABASE_SERVICE_KEY');
if (!process.env.BREVO_API_KEY) console.error('Missing BREVO_API_KEY');
if (!process.env.NOTIFICATION_EMAIL) console.error('Missing NOTIFICATION_EMAIL');

module.exports = async function handler(req, res) {
  if (!(await guardRequest(req, res, 'contact'))) return;

  try {
    const body = jsonBody(req);
    if (!(await enforceEmailRateLimit(res, 'contact', body && body.email))) return;
    if (await rejectIfBot(req, res, body)) return;

    const fields = readContactFields(body);
    if (fields.error) {
      console.error('Contact API: validation failed —', fields.error);
      return res.status(400).json({ error: fields.error });
    }

    const { name, email, subject, message } = fields;
    const storedSubject = subject || '(no subject)';

    const { error } = await getSupabase()
      .from('contact_submissions')
      .insert({
        name,
        subject: storedSubject,
        email,
        message,
        submitted_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Contact API: Supabase insert failed:', error.code || 'error');
      return res.status(500).json({ error: 'Failed to save' });
    }

    if (!process.env.NOTIFICATION_EMAIL) {
      console.error('Contact API: skipping email — NOTIFICATION_EMAIL not set');
    } else if (!process.env.BREVO_API_KEY) {
      console.error('Contact API: skipping email — BREVO_API_KEY not set');
    } else {
      try {
        const safeName = escapeHtml(name);
        const safeEmail = escapeHtml(email);
        const safeSubject = escapeHtml(storedSubject);
        const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
        await sendBrevoEmail({
          to: process.env.NOTIFICATION_EMAIL,
          subject: stripCrlf(`📬 New Contact: ${subject || 'No subject'}`).slice(0, 200),
          html: `
        <h2>New contact form submission</h2>
        <p><strong>Name:</strong> ${safeName}</p>
        <p><strong>Email:</strong> ${safeEmail}</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <p><strong>Message:</strong></p>
        <p>${safeMessage}</p>
      `,
        });
      } catch (emailError) {
        console.error('Contact API: Brevo send failed:', emailError && emailError.message);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Contact API: unhandled error:', err && err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
