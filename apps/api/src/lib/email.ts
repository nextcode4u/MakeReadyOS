import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { mailConfig } from "./config.js";
import { renderInviteHtml } from "./inviteTemplate.js";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!mailConfig.enabled) {
    throw new Error("SMTP invite email is not configured.");
  }
  if (transporter) {
    return transporter;
  }
  const options: SMTPTransport.Options = {
    host: mailConfig.host || undefined,
    port: mailConfig.port,
    secure: mailConfig.secure,
    auth: mailConfig.user ? { user: mailConfig.user, pass: mailConfig.password || undefined } : undefined,
  };
  transporter = nodemailer.createTransport(options);
  return transporter;
}

export function inviteEmailConfigured() {
  return mailConfig.enabled;
}

export async function sendUserInviteEmail(input: {
  to: string;
  username: string;
  fullName: string;
  role: string;
  language: "en" | "es";
  setupUrl: string;
  propertyCodes: string[];
}) {
  const loginUrl = input.setupUrl;
  const propertySummary = input.propertyCodes.length ? input.propertyCodes.join(", ") : "All assigned properties";
  const englishText = [
    `Hello ${input.fullName},`,
    "",
    "A MakeReadyOS account has been created for you.",
    "",
    `Sign in: ${loginUrl}`,
    `Username: ${input.username}`,
    `Email: ${input.to}`,
    "Choose your own password using the link above. This single-use link expires in 1 hour.",
    `Role: ${input.role}`,
    `Property access: ${propertySummary}`,
    "",
    "Keep this message secure. If you need a password reset, contact your manager or admin.",
  ].join("\n");
  const spanishText = [
    `Hola ${input.fullName},`,
    "",
    "Se creó una cuenta de MakeReadyOS para usted.",
    "",
    `Iniciar sesión: ${loginUrl}`,
    `Usuario: ${input.username}`,
    `Correo: ${input.to}`,
    "Elija su contrasena con el enlace anterior. El enlace es de un solo uso y vence en 1 hora.",
    `Rol: ${input.role}`,
    `Acceso a propiedades: ${propertySummary}`,
    "",
    "Mantenga este mensaje seguro. Si necesita restablecer la contraseña, contacte a su gerente o administrador.",
  ].join("\n");
  await getTransporter().sendMail({
    from: mailConfig.from,
    to: input.to,
    replyTo: mailConfig.replyTo || undefined,
    subject: input.language === "es" ? "Su acceso a MakeReadyOS" : "Your MakeReadyOS access",
    text: input.language === "es" ? spanishText : englishText,
    html: renderInviteHtml(input, loginUrl),
  });
}

export async function sendPasswordResetEmail(to: string, fullName: string, language: "en" | "es", setupUrl: string) {
  const es = language === "es";
  await getTransporter().sendMail({
    from: mailConfig.from, to, replyTo: mailConfig.replyTo || undefined,
    subject: es ? "Restablecer su contrasena de MakeReadyOS" : "Reset your MakeReadyOS password",
    text: `${es ? "Restablezca su contrasena" : "Reset your password"}: ${setupUrl}\n${es ? "El enlace vence en 1 hora. Si no lo solicito, ignore este mensaje." : "This single-use link expires in 1 hour. If you did not request it, ignore this message. Your password has not changed."}`,
    html: renderInviteHtml({ fullName, username: "", to, role: "", propertyCodes: [], language }, setupUrl, true),
  });
}
