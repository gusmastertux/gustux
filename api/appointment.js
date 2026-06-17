// api/appointment.js
// Función serverless: guardar cita en Supabase + enviar correo de confirmación

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { client_name, client_email, client_phone, service, appointment_date, appointment_time, message } = req.body;

    if (!client_name || !client_email || !appointment_date || !appointment_time) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // 1. Guardar en Supabase
    const { data: appt, error } = await supabase
      .from('appointments')
      .insert([{ client_name, client_email, client_phone, service, appointment_date, appointment_time, message, status: 'pendiente' }])
      .select()
      .single();

    if (error) throw error;

    const fechaFormateada = formatDate(appointment_date);
    const hora = appointment_time.slice(0, 5);

    // 2. Correo al CLIENTE
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: client_email,
      subject: `Cita confirmada — ${service} · ${fechaFormateada}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#080c14;color:#f0f4ff;padding:32px;border-radius:16px">
          <div style="text-align:center;margin-bottom:24px">
            <span style="color:#2563eb;font-size:1.8rem;font-weight:900">Gustux</span>
          </div>
          <h2 style="color:#f0f4ff">¡Tu cita está confirmada! 📅</h2>
          <p style="color:#7a8ba8">Hola <strong style="color:#f0f4ff">${client_name}</strong>, hemos registrado tu cita exitosamente.</p>
          <div style="background:#111827;border:1px solid #1f2d45;border-radius:12px;padding:20px;margin:20px 0">
            <p style="margin:0 0 10px;font-size:1.1rem">📌 <strong>${service}</strong></p>
            <p style="margin:0 0 8px;color:#7a8ba8">📆 ${fechaFormateada}</p>
            <p style="margin:0 0 8px;color:#7a8ba8">🕐 ${hora} hrs</p>
            ${message ? `<p style="margin:8px 0 0;color:#7a8ba8;font-size:.9rem">Mensaje: ${message}</p>` : ''}
          </div>
          <div style="background:rgba(37,99,235,0.1);border:1px solid rgba(37,99,235,0.3);border-radius:10px;padding:14px;margin-top:16px">
            <p style="margin:0;font-size:.85rem;color:#7a8ba8">⚠️ Si necesitas reagendar o cancelar, escríbenos a <strong style="color:#0ea5e9">contacto@gustux.cl</strong> con al menos 24 horas de anticipación.</p>
          </div>
          <p style="color:#7a8ba8;font-size:.8rem;margin-top:20px;text-align:center">Gustux · Santiago, Chile · gustux.cl</p>
        </div>
      `
    });

    // 3. Correo al ADMIN
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: process.env.ADMIN_EMAIL,
      subject: `📅 Nueva cita — ${client_name} · ${fechaFormateada} ${hora}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <h2>Nueva cita agendada</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Cliente</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${client_name}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Email</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${client_email}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Teléfono</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${client_phone || '—'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Servicio</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${service}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Fecha</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${fechaFormateada}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Hora</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${hora} hrs</td></tr>
            <tr><td style="padding:8px"><strong>Mensaje</strong></td><td style="padding:8px">${message || '—'}</td></tr>
          </table>
          <a href="${process.env.SITE_URL}/admin" style="display:inline-block;margin-top:16px;background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:700">Ver en Agenda →</a>
        </div>
      `
    });

    return res.status(200).json({ success: true, id: appt.id });

  } catch (err) {
    console.error('Error en appointment.js:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
