import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { authConfig, mailConfig } from "./config.js";

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
  password: string;
  propertyCodes: string[];
}) {
  const loginUrl = authConfig.appUrl || "your MakeReadyOS URL";
  const propertySummary = input.propertyCodes.length ? input.propertyCodes.join(", ") : "All assigned properties";
  const englishText = [
    `Hello ${input.fullName},`,
    "",
    "A MakeReadyOS account has been created for you.",
    "",
    `Sign in: ${loginUrl}`,
    `Username: ${input.username}`,
    `Email: ${input.to}`,
    `Temporary password: ${input.password}`,
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
    `Contraseña temporal: ${input.password}`,
    `Rol: ${input.role}`,
    `Acceso a propiedades: ${propertySummary}`,
    "",
    "Mantenga este mensaje seguro. Si necesita restablecer la contraseña, contacte a su gerente o administrador.",
  ].join("\n");
  const englishHtml = `
    <p>Hello ${escapeHtml(input.fullName)},</p>
    <p>A MakeReadyOS account has been created for you.</p>
    <p><strong>Sign in:</strong> <a href="${escapeAttribute(loginUrl)}">${escapeHtml(loginUrl)}</a><br />
    <strong>Username:</strong> ${escapeHtml(input.username)}<br />
    <strong>Email:</strong> ${escapeHtml(input.to)}<br />
    <strong>Temporary password:</strong> ${escapeHtml(input.password)}<br />
    <strong>Role:</strong> ${escapeHtml(input.role)}<br />
    <strong>Property access:</strong> ${escapeHtml(propertySummary)}</p>
    <p>Keep this message secure. If you need a password reset, contact your manager or admin.</p>
  `;
  const spanishHtml = `
    <p>Hola ${escapeHtml(input.fullName)},</p>
    <p>Se creó una cuenta de MakeReadyOS para usted.</p>
    <p><strong>Iniciar sesión:</strong> <a href="${escapeAttribute(loginUrl)}">${escapeHtml(loginUrl)}</a><br />
    <strong>Usuario:</strong> ${escapeHtml(input.username)}<br />
    <strong>Correo:</strong> ${escapeHtml(input.to)}<br />
    <strong>Contraseña temporal:</strong> ${escapeHtml(input.password)}<br />
    <strong>Rol:</strong> ${escapeHtml(input.role)}<br />
    <strong>Acceso a propiedades:</strong> ${escapeHtml(propertySummary)}</p>
    <p>Mantenga este mensaje seguro. Si necesita restablecer la contraseña, contacte a su gerente o administrador.</p>
  `;

  await getTransporter().sendMail({
    from: mailConfig.from,
    to: input.to,
    replyTo: mailConfig.replyTo || undefined,
    subject: input.language === "es" ? "Su acceso a MakeReadyOS" : "Your MakeReadyOS access",
    text: input.language === "es" ? spanishText : englishText,
    html: input.language === "es" ? spanishHtml : englishHtml,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}
