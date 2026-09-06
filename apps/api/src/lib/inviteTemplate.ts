type InviteDetails = {
  fullName: string;
  username: string;
  to: string;
  role: string;
  propertyCodes: string[];
  language: "en" | "es";
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function renderInviteHtml(input: InviteDetails, loginUrl: string, reset = false) {
  const es = input.language === "es";
  const title = reset ? (es ? "Restablezca su contrasena" : "Reset your password") : (es ? "Le damos la bienvenida" : "Welcome to your team");
  const greeting = es ? `Hola ${input.fullName},` : `Hello ${input.fullName},`;
  const intro = reset ? (es ? "Recibimos una solicitud para restablecer su contrasena. Si no la solicito, ignore este mensaje." : "We received a request to reset your password. If this was not you, ignore this message. Your password has not changed.") : (es ? "Su equipo le ha invitado a MakeReadyOS. Elija su propia contrasena para comenzar." : "Your team has invited you to MakeReadyOS. Choose your own password to get started.");
  const security = es ? "Este enlace es de un solo uso y vence en 1 hora. No lo reenvie. Si vence, solicite otro desde Olvido su contrasena en la pagina de acceso." : "This single-use link expires in 1 hour. Do not forward it. If it expires, request another using Forgot password on the sign-in page.";
  const rows = [
    [es ? "Usuario" : "Username", input.username],
    [es ? "Correo" : "Email", input.to],
    [es ? "Rol" : "Role", input.role.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())],
    [es ? "Propiedades" : "Property access", reset ? "" : input.propertyCodes.join(", ") || (es ? "Propiedades asignadas" : "Assigned properties")],
  ].filter(([, value]) => Boolean(value));
  // Table layout and inline styles keep the invitation usable in email clients.
  return `<!doctype html>
<html lang="${input.language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | MakeReadyOS</title></head>
<body style="margin:0;padding:0;background:#edf1f5;color:#182638;font-family:Verdana,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf1f5;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border:1px solid #dce3eb;">
<tr><td style="padding:28px 24px;background:#102033;border-bottom:4px solid #2871d8;">
<p style="margin:0;color:#ffffff;font-size:24px;font-weight:bold;letter-spacing:-1px;">MakeReadyOS</p>
<p style="margin:8px 0 0;color:#b9cce1;font-size:11px;letter-spacing:2px;">${reset ? (es ? "SEGURIDAD DE LA CUENTA" : "ACCOUNT SECURITY") : (es ? "INVITACION A SU EQUIPO" : "YOUR TEAM INVITATION")}</p></td></tr>
<tr><td style="padding:28px 24px;">
<h1 style="margin:0 0 20px;font-size:26px;line-height:1.3;color:#102033;">${title}</h1>
<p style="margin:0 0 12px;font-size:14px;line-height:1.7;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#4c5c70;">${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border-top:1px solid #dce3eb;">
${rows.map(([label, value]) => `<tr><td style="padding:12px 0;border-bottom:1px solid #dce3eb;overflow-wrap:anywhere;word-break:break-word;"><p style="margin:0 0 5px;font-size:11px;color:#53657a;">${escapeHtml(label)}</p><p style="margin:0;font-size:14px;line-height:1.5;color:#182638;">${escapeHtml(value)}</p></td></tr>`).join("")}
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td bgcolor="#205fc4" style="border-radius:5px;text-align:center;"><a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:15px 24px;border:1px solid #205fc4;border-radius:5px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;">${es ? "Elegir mi contrasena" : "Set my password"}</a></td></tr></table>
<p style="margin:0;font-size:12px;line-height:1.7;color:#53657a;">${es ? "O abra este enlace:" : "Or open this link:"}<br><a href="${escapeHtml(loginUrl)}" style="color:#205fc4;overflow-wrap:anywhere;word-break:break-all;">${escapeHtml(loginUrl)}</a></p>
</td></tr>
<tr><td style="padding:20px 24px;background:#f5f7fa;border-top:1px solid #dce3eb;"><p style="margin:0;font-size:11px;line-height:1.8;color:#53657a;">${escapeHtml(security)}</p><p style="margin:12px 0 0;font-size:11px;line-height:1.8;color:#53657a;">${es ? "Si no esperaba esta invitacion, contacte al administrador antes de iniciar sesion." : "If you were not expecting this invitation, contact the administrator before signing in."}</p></td></tr>
</table></td></tr></table></body></html>`;
}
