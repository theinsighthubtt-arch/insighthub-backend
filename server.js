import rateLimit from "express-rate-limit";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import 'dotenv/config';
import nodemailer from "nodemailer";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                  // limit each IP to 20 requests per window
  standardHeaders: true,
  legacyHeaders: false,
});


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 4000);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const app = express();
app.set("x-powered-by", false);
app.use(helmet());
app.use(express.json({ limit: "256kb" }));
app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN }));

// helpers
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
const notEmpty = (s) => typeof s === "string" && s.trim().length > 0;

app.post("/api/book", limiter, async (req, res) => {
  const { name, email, company = "", date, time, notes = "" } = req.body || {};

  const errors = {};
  if (!notEmpty(name)) errors.name = "Name is required";
  if (!isEmail(email)) errors.email = "Valid email is required";
  if (!notEmpty(date)) errors.date = "Select a date";
  if (!notEmpty(time)) errors.time = "Select a time";
  if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CONTACT_TO, CONTACT_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !CONTACT_TO || !CONTACT_FROM) {
    return res.status(500).json({ ok: false, error: "Email not configured on server" });
  }

  try {
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465, // true for 465, false for 587
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const subject = `New booking: ${name} (${company || "no company"})`;
    const text =
`New booking request
Name: ${name}
Email: ${email}
Company: ${company}
Date: ${date}
Time: ${time}
Notes: ${notes || "(none)"}`
    const html = `
      <h2>New booking request</h2>
      <p><b>Name:</b> ${name}</p>
      <p><b>Email:</b> ${email}</p>
      <p><b>Company:</b> ${company || "-"}</p>
      <p><b>Date:</b> ${date}</p>
      <p><b>Time:</b> ${time}</p>
      <p><b>Notes:</b><br/>${(notes || "-").replace(/\n/g, "<br/>")}</p>
    `;

    await transport.sendMail({
      from: CONTACT_FROM,   // must be your Gmail or verified alias
      to: CONTACT_TO,       // where you receive the booking
      subject,
      text,
      html,
      replyTo: email        // replying goes to the requester
    });

    return res.json({ ok: true });
  } catch (err) {
    console.error("Email send failed:", err.message);
    return res.status(502).json({ ok: false, error: "Failed to send email" });
  }
});
app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
// ---- (optional) contact endpoint still here if you use later

// ---- 404
app.use((req, res) => res.status(404).json({ ok: false, error: "Not found" }));

// ---- start
app.listen(PORT, () => console.log(`API ready on http://localhost:${PORT}`));


