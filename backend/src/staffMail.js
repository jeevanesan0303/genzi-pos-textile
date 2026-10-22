import nodemailer from "nodemailer";

export function checkStaffMailConfiguration() {
  const required = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM"
  ];

  if (required.some(key => !process.env[key]?.trim())) {
    const error = new Error(
      "Configure SMTP in backend/.env before creating POS-access accounts."
    );
    error.status = 400;
    throw error;
  }

  const port = Number(process.env.SMTP_PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error("Invalid SMTP port.");
    error.status = 400;
    throw error;
  }
}

export async function sendStaffCredentials({
  name,
  email,
  password
}) {
  checkStaffMailConfiguration();

  const secure = process.env.SMTP_SECURE === "true";

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure,
    requireTLS: !secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });

  const loginUrl = process.env.POS_LOGIN_URL?.trim();

  const result = await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: "Your Gen Zi Corner POS account",
    text: [
      `Hello ${name},`,
      "",
      "Your Gen Zi Corner POS account credentials are:",
      "",
      `Email: ${email}`,
      `Password: ${password}`,
      "",
      loginUrl
        ? `Sign in: ${loginUrl}`
        : "Please contact your administrator for the POS login address.",
      "",
      "Keep these credentials private.",
      "",
      "Gen Zi Corner"
    ].join("\n")
  });

  if (!result.accepted?.length || result.rejected?.length) {
    throw new Error("SMTP did not accept the recipient.");
  }
}