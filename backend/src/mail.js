import nodemailer from "nodemailer";

export async function sendMail(to, subject, text) {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  if (!host || !user || !pass) {
    console.error("Email needs SMTP_HOST, SMTP_USER, and SMTP_PASS in backend/.env. Gmail also needs an app password, not the normal account password.");
    const err = new Error("The code could not be emailed just now. Try again in a moment.");
    err.status = 503;
    throw err;
  }

  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}

export async function sendStudentCode(email, code) {
  await sendMail(
    email,
    "Your AfriResQ code",
    `Your AfriResQ code is ${code}. It expires in 10 minutes. If you did not ask for it, you can ignore this email.`,
  );
}
