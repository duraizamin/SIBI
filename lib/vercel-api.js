"use strict";

const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");

const SESSION_COOKIE = "sibi.sid";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const membershipPlans = [
  { name: "Strength Training · 1 Month", price: 900 },
  { name: "Strength Training · 3 Months", price: 2000 },
  { name: "Strength Training · 6 Months", price: 4000 },
  { name: "Strength Training · 1 Year", price: 5999 },
  { name: "Strength & Cardio · 1 Month", price: 1400 },
  { name: "Strength & Cardio · 3 Months", price: 3500 },
  { name: "Strength & Cardio · 6 Months", price: 6000 },
  { name: "Strength & Cardio · 1 Year", price: 9999 },
  { name: "Personal Training", price: null },
  { name: "Cardio", price: null },
];
const legacyMembershipPlans = ["Basic", "Premium", "Elite"];
const templates = [
  ["Festival message", "festival", "Festival Greetings", "Wishing you and your family a joyful festival from the Sibi Sports Club team! We hope you have a wonderful celebration."],
  ["Maintenance update", "maintenance", "Maintenance Update", "Hi {{name}}, the club will have a maintenance update on {{date}}. Thank you for your understanding."],
  ["Welcome message", "welcome", "Welcome to Sibi", "Hi {{name}}, welcome to Sibi Sports Club! Your member ID is {{member_id}}. We are excited to have you with us."],
  ["Membership renewal", "renewal", "Membership Renewal", "Hi {{name}}, your Sibi membership is coming up for renewal. Please contact the club team to continue your plan."],
  ["Offers & packages", "offers", "Special Offer", "Hi {{name}}, we have a new membership offer and package update for you. Contact the Sibi team to learn more."],
  ["Custom message", "custom", "Message from Sibi", "Hi {{name}}, greetings from Sibi Sports Club!"],
];
const clubTrainers = [
  ["Mahalingam", "Personal Training", 8, "Experienced in providing personalized training sessions and helping members work toward their fitness goals.", "Personal Training"],
  ["Ameen", "Personal Training", 8, "Experienced coach focused on structured one-to-one training and individualized fitness plans.", "Personal Training"],
  ["Rajesh", "Personal Training", 8, "Provides personalized coaching and progressive training plans tailored to each member.", "Personal Training"],
  ["Ramesh", "Personal Training", 8, "Helps members build consistent training routines with guidance tailored to their individual goals.", "Personal Training"],
];

let sql;
let schemaPromise;

function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured. Add the Neon connection string to the Vercel project's protected environment variables.");
  if (!sql) sql = neon(process.env.DATABASE_URL);
  return sql;
}

async function query(text, params = []) {
  return database().query(text, params);
}

async function ensureSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      member_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
      plan TEXT NOT NULL DEFAULT 'Basic',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      archived_at TIMESTAMPTZ,
      membership_due_date DATE,
      address TEXT NOT NULL DEFAULT '',
      height_cm DOUBLE PRECISION,
      weight_kg DOUBLE PRECISION,
      profile_photo TEXT NOT NULL DEFAULT '',
      age INTEGER,
      gender TEXT NOT NULL DEFAULT '',
      fitness_goal TEXT NOT NULL DEFAULT '',
      preferred_membership TEXT NOT NULL DEFAULT '',
      emergency_contact TEXT NOT NULL DEFAULT '',
      custom_plan_details TEXT NOT NULL DEFAULT '',
      custom_plan_amount_paise INTEGER
    )`,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email))",
    "CREATE INDEX IF NOT EXISTS idx_users_member_id ON users (member_id)",
    "CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone)",
    `CREATE TABLE IF NOT EXISTS trainers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      experience_years INTEGER NOT NULL DEFAULT 1,
      bio TEXT NOT NULL,
      certifications TEXT NOT NULL DEFAULT '',
      photo_url TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS enquiries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      topic TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      place TEXT NOT NULL DEFAULT '',
      converted_user_id INTEGER REFERENCES users(id)
    )`,
    "CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries (created_at)",
    "CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries (status)",
    `CREATE TABLE IF NOT EXISTS reminders (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      audience TEXT NOT NULL,
      message TEXT NOT NULL,
      scheduled_at_utc TIMESTAMPTZ NOT NULL,
      display_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
      status TEXT NOT NULL DEFAULT 'draft',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders (scheduled_at_utc)",
    `CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      transaction_ref TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount_paise INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
      method TEXT NOT NULL DEFAULT 'manual',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id, created_at)",
    `CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'all',
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS message_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      template_id INTEGER REFERENCES message_templates(id),
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      image_data TEXT NOT NULL DEFAULT '',
      recipient_name TEXT NOT NULL DEFAULT '',
      recipient_member_id TEXT NOT NULL DEFAULT '',
      recipient_phone TEXT NOT NULL DEFAULT '',
      delivery_mode TEXT NOT NULL DEFAULT 'manual' CHECK (delivery_mode IN ('manual','automatic')),
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','scheduled','sent','failed','cancelled')),
      created_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      delivery_error TEXT NOT NULL DEFAULT '',
      provider_message_id TEXT NOT NULL DEFAULT '',
      delivery_status TEXT NOT NULL DEFAULT ''
    )`,
    "CREATE INDEX IF NOT EXISTS idx_messages_user ON messages (user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_messages_schedule ON messages (status, scheduled_at)",
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at)",
    `CREATE TABLE IF NOT EXISTS auth_attempts (
      ip_hash TEXT NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
    "CREATE INDEX IF NOT EXISTS idx_auth_attempts_time ON auth_attempts (attempted_at)",
  ];

  for (const statement of statements) await query(statement);

  for (const [name, category, subject, body] of templates) {
    await query(
      "INSERT INTO message_templates (name, category, subject, body) VALUES ($1,$2,$3,$4) ON CONFLICT (name) DO NOTHING",
      [name, category, subject, body],
    );
  }

  for (const [name, specialty, years, bio, certifications] of clubTrainers) {
    await query(
      `INSERT INTO trainers (name, specialty, experience_years, bio, certifications)
       SELECT $1,$2,$3,$4,$5 WHERE NOT EXISTS (SELECT 1 FROM trainers WHERE name=$1 AND active=TRUE)`,
      [name, specialty, years, bio, certifications],
    );
  }

  const missingAdminSettings = ["ADMIN_EMAIL", "ADMIN_PASSWORD", "SESSION_SECRET"].filter((key) => !process.env[key]);
  if (missingAdminSettings.length) {
    throw new Error(`Missing required Vercel environment settings: ${missingAdminSettings.join(", ")}.`);
  }
  const adminEmail = clean(process.env.ADMIN_EMAIL, 160).toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!EMAIL_PATTERN.test(adminEmail) || adminPassword.length < 12 || process.env.SESSION_SECRET.length < 32) {
    throw new Error("ADMIN_EMAIL must be valid, ADMIN_PASSWORD must be at least 12 characters, and SESSION_SECRET must be at least 32 characters.");
  }
  const existingAdmin = await query("SELECT id FROM users WHERE member_id='SSC-ADMIN' LIMIT 1");
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  if (!existingAdmin.length) {
    await query(
      `INSERT INTO users (member_id, name, email, phone, password_hash, role, plan, status)
       VALUES ('SSC-ADMIN',$1,$2,'Not provided',$3,'admin','Staff','active')
       ON CONFLICT (member_id) DO NOTHING`,
      [clean(process.env.ADMIN_NAME || "Sibi Administrator", 100), adminEmail, passwordHash],
    );
  } else {
    await query(
      "UPDATE users SET email=$1,password_hash=$2,updated_at=now() WHERE member_id='SSC-ADMIN' AND role='admin'",
      [adminEmail, passwordHash],
    );
  }
}

function clean(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validPlan(plan) {
  return membershipPlans.some((option) => option.name === plan) || legacyMembershipPlans.includes(plan);
}

function planDetails(plan, details, amount) {
  if (validPlan(plan)) return { valid: true, details: "", amountPaise: null };
  const cleanDetails = clean(details, 120);
  const numericAmount = Number(amount);
  if (plan !== "Custom" || cleanDetails.length < 2 || !Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 10000000) {
    return { valid: false, details: "", amountPaise: null };
  }
  return { valid: true, details: cleanDetails, amountPaise: Math.round(numericAmount * 100) };
}

function membershipPlanFromPreference(preference) {
  const normalized = String(preference || "").toLowerCase();
  return membershipPlans.find((option) => normalized.startsWith(option.name.toLowerCase()))?.name || null;
}

function normalizeEmail(email, memberId) {
  return email || `${memberId}@member.local`;
}

function displayUser(user) {
  if (!user) return user;
  return { ...user, email: (user.email || "").endsWith("@member.local") ? "" : user.email };
}

function cookieSecure() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

function cookieHeader(value, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${cookieSecure() ? "; Secure" : ""}`;
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", cookieHeader("", 0));
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return ["", ""];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function signToken(token) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET).update(token).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const signedToken = `${token}.${signToken(token)}`;
  await query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,now() + interval '8 hours')",
    [tokenHash, userId],
  );
  res.setHeader("Set-Cookie", cookieHeader(signedToken, SESSION_TTL_MS / 1000));
}

async function currentUser(req, res) {
  const value = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
  if (!value) return null;
  const [token, signature, extra] = value.split(".");
  if (!token || !signature || extra || !safeEqual(signature, signToken(token))) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const rows = await query(
    `SELECT u.id,u.member_id,u.name,u.email,u.phone,u.address,u.role,u.plan,
            u.custom_plan_details,u.custom_plan_amount_paise,u.status,u.membership_due_date,
            u.height_cm,u.weight_kg,u.profile_photo,u.age,u.gender,u.fitness_goal,
            u.preferred_membership,u.emergency_contact,u.created_at
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>now() AND (u.role='admin' OR u.archived_at IS NULL)`,
    [tokenHash],
  );
  if (!rows[0]) return null;
  await query("UPDATE sessions SET expires_at=now() + interval '8 hours' WHERE token_hash=$1", [tokenHash]);
  res.setHeader("Set-Cookie", cookieHeader(value, SESSION_TTL_MS / 1000));
  return displayUser(rows[0]);
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function errorResponse(res, status, message) {
  json(res, status, { error: message });
}

function pgConflict(error) {
  return error?.code === "23505" || error?.code === "23503";
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 3 * 1024 * 1024) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  if (!size) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function parseScheduledDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return new Date(Number.NaN);
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const [year, month, day, hour, minute] = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const localAsUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (localAsUtc.getUTCFullYear() !== year || localAsUtc.getUTCMonth() !== month - 1 || localAsUtc.getUTCDate() !== day || localAsUtc.getUTCHours() !== hour || localAsUtc.getUTCMinutes() !== minute) return new Date(Number.NaN);
  return new Date(localAsUtc.getTime() - 330 * 60 * 1000);
}

function validPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  return digits.length >= 11 && digits.length <= 15;
}

function validDate(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function createMember(data) {
  const temporaryId = `TEMP-${crypto.randomUUID()}`;
  const created = await query(
    `INSERT INTO users
       (member_id,name,email,phone,address,password_hash,role,plan,custom_plan_details,
        custom_plan_amount_paise,status,age,gender,fitness_goal,preferred_membership,
        emergency_contact,height_cm,weight_kg,profile_photo,membership_due_date)
     VALUES ($1,$2,$3,$4,$5,$6,'member',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING id`,
    [
      temporaryId, data.name, normalizeEmail(data.email, temporaryId), data.phone, data.address || "",
      data.hash, data.plan || membershipPlans[0].name, data.customPlanDetails || "",
      data.customPlanAmountPaise || null, data.status || "pending", data.age || null,
      data.gender || "", data.fitness_goal || "", data.preferred_membership || "",
      data.emergency_contact || "", data.height_cm || null, data.weight_kg || null,
      data.profile_photo || "", data.membership_due_date || null,
    ],
  );
  const id = created[0].id;
  const memberId = `SSC-${new Date().getUTCFullYear()}-${String(id).padStart(6, "0")}`;
  const rows = await query(
    `UPDATE users SET member_id=$1,email=$2 WHERE id=$3
     RETURNING id,member_id,name,email,phone,address,role,plan,custom_plan_details,
       custom_plan_amount_paise,status,membership_due_date,height_cm,weight_kg,
       profile_photo,age,gender,fitness_goal,preferred_membership,emergency_contact,created_at`,
    [memberId, data.email || `${memberId}@member.local`, id],
  );
  return displayUser(rows[0]);
}

async function limitAuth(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const remote = forwarded || String(req.socket?.remoteAddress || "unknown");
  const ipHash = crypto.createHash("sha256").update(remote).digest("hex");
  await query("DELETE FROM auth_attempts WHERE attempted_at < now() - interval '1 day'");
  const count = await query(
    "SELECT count(*)::integer AS count FROM auth_attempts WHERE ip_hash=$1 AND attempted_at>now()-interval '15 minutes'",
    [ipHash],
  );
  if (count[0]?.count >= 30) return false;
  await query("INSERT INTO auth_attempts (ip_hash) VALUES ($1)", [ipHash]);
  return true;
}

const memberSelect = `SELECT u.id,u.member_id,u.name,u.email,u.phone,u.address,u.plan,
  u.custom_plan_details,u.custom_plan_amount_paise,u.status,u.archived_at,u.membership_due_date,
  u.height_cm,u.weight_kg,u.profile_photo,u.age,u.gender,u.fitness_goal,u.preferred_membership,
  u.emergency_contact,u.created_at,u.updated_at,
  (SELECT p.status FROM payments p WHERE p.user_id=u.id ORDER BY p.id DESC LIMIT 1) AS payment_status,
  (SELECT p.method FROM payments p WHERE p.user_id=u.id ORDER BY p.id DESC LIMIT 1) AS payment_method,
  (SELECT p.created_at FROM payments p WHERE p.user_id=u.id ORDER BY p.id DESC LIMIT 1) AS last_payment_at
  FROM users u WHERE u.role='member'`;

async function handle(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");

  if (!schemaPromise) schemaPromise = ensureSchema().catch((error) => {
    schemaPromise = undefined;
    throw error;
  });
  await schemaPromise;

  const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  const routedPath = url.searchParams.get("__route");
  const path = routedPath
    ? `/api/${routedPath.replace(/^\/+|\/+$/g, "")}`
    : url.pathname.replace(/\/+$/, "") || "/";
  const method = String(req.method || "GET").toUpperCase();
  const body = ["POST", "PATCH", "PUT", "DELETE"].includes(method) ? await readBody(req) : {};
  const idMatch = path.match(/^\/api\/admin\/(members|payments|templates|trainers|enquiries|messages)\/(\d+)(?:\/(restore|status|complete))?$/);
  const id = idMatch ? Number(idMatch[2]) : 0;
  const suffix = idMatch?.[3] || "";
  const current = async () => currentUser(req, res);
  const requireUser = async () => {
    const user = await current();
    return user || false;
  };
  const requireAdmin = async () => {
    const user = await current();
    return user?.role === "admin" ? user : false;
  };

  if (path === "/api/health" && method === "GET") {
    await query("SELECT 1");
    return json(res, 200, { ok: true, timezone: process.env.APP_TIMEZONE || "Asia/Kolkata", database: "connected", whatsapp: "disabled" });
  }
  if (path === "/api/trainers" && method === "GET") {
    const trainers = await query("SELECT id,name,specialty,experience_years,bio,certifications,photo_url FROM trainers WHERE active=TRUE ORDER BY id");
    return json(res, 200, { trainers });
  }
  if (path === "/api/enquiries" && method === "POST") {
    const name = clean(body.name, 100);
    const phone = clean(body.phone, 30);
    const email = clean(body.email, 160).toLowerCase();
    const place = clean(body.place, 160);
    const topic = clean(body.topic, 100) || "General enquiry";
    const message = clean(body.message, 2000);
    if (name.length < 2 || phone.length < 7 || (email && !EMAIL_PATTERN.test(email)) || place.length < 2 || message.length < 5) {
      return errorResponse(res, 400, "Please complete your name, phone, place and message. Email is optional.");
    }
    const rows = await query(
      "INSERT INTO enquiries (name,phone,email,place,topic,message) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [name, phone, email, place, topic, message],
    );
    return json(res, 201, { ok: true, enquiryId: rows[0].id });
  }

  if (path === "/api/auth/register" && method === "POST") {
    const signedInUser = await requireUser();
    if (!signedInUser) return errorResponse(res, 401, "Please sign in as an administrator to create member accounts.");
    if (signedInUser.role !== "admin") return errorResponse(res, 403, "Only administrators can create member accounts.");
    if (!(await limitAuth(req))) return errorResponse(res, 429, "Too many sign-in or registration attempts. Please wait and try again.");
    const name = clean(body.name, 100);
    const email = clean(body.email, 160).toLowerCase();
    const phone = clean(body.phone, 30);
    const address = clean(body.address, 300);
    const age = Number(body.age);
    const gender = clean(body.gender, 30);
    const fitnessGoal = Array.isArray(body.fitness_goal)
      ? body.fitness_goal.map((value) => clean(value, 60)).filter(Boolean).join(", ")
      : clean(body.fitness_goal, 300);
    const preferredMembership = clean(body.preferred_membership, 100);
    const emergencyContact = clean(body.emergency_contact, 30);
    const plan = membershipPlanFromPreference(preferredMembership);
    if (name.length < 2 || phone.length < 7 || !Number.isInteger(age) || age < 12 || age > 100 || !gender || !address || !fitnessGoal || !plan || emergencyContact.length < 7 || (email && !EMAIL_PATTERN.test(email))) {
      return errorResponse(res, 400, "Please complete your name, phone, address, fitness goal, preferred membership and emergency contact. Email is optional.");
    }
    const temporaryPassword = `Sibi@${crypto.randomBytes(4).toString("hex").toUpperCase()}!`;
    const user = await createMember({
      name, email, phone, address, age, gender, fitness_goal: fitnessGoal,
      preferred_membership: preferredMembership, emergency_contact: emergencyContact,
      plan, status: "pending", hash: await bcrypt.hash(temporaryPassword, 12),
    });
    return json(res, 201, { user, temporaryPassword, message: "Registration submitted successfully." });
  }

  if (path === "/api/auth/login" && method === "POST") {
    if (!(await limitAuth(req))) return errorResponse(res, 429, "Too many sign-in or registration attempts. Please wait and try again.");
    const identifier = clean(body.email || body.identifier, 160).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    const rows = await query(
      "SELECT * FROM users WHERE (lower(email)=$1 OR lower(member_id)=$1) AND (role='admin' OR archived_at IS NULL) LIMIT 1",
      [identifier],
    );
    const userRecord = rows[0];
    if (!userRecord || !(await bcrypt.compare(password, userRecord.password_hash))) {
      return errorResponse(res, 401, "Member ID/email or password is incorrect.");
    }
    const fields = await query(
      `SELECT id,member_id,name,email,phone,address,role,plan,custom_plan_details,
       custom_plan_amount_paise,status,membership_due_date,height_cm,weight_kg,
       profile_photo,age,gender,fitness_goal,preferred_membership,emergency_contact,created_at
       FROM users WHERE id=$1`,
      [userRecord.id],
    );
    await createSession(userRecord.id, res);
    const user = displayUser(fields[0]);
    return json(res, 200, { user, redirect: user.role === "admin" ? "/admin.html" : "/member.html" });
  }

  if (path === "/api/auth/logout" && method === "POST") {
    const value = parseCookies(req.headers.cookie || "")[SESSION_COOKIE];
    if (value) {
      const [token, signature] = value.split(".");
      if (token && signature && safeEqual(signature, signToken(token))) {
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        await query("DELETE FROM sessions WHERE token_hash=$1", [tokenHash]);
      }
    }
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }
  if (path === "/api/auth/me" && method === "GET") {
    const user = await requireUser();
    if (!user) return errorResponse(res, 401, "Please sign in to continue.");
    return json(res, 200, { user });
  }

  if (path === "/api/member/dashboard" && method === "GET") {
    const user = await requireUser();
    if (!user) return errorResponse(res, 401, "Please sign in to continue.");
    if (user.role !== "member") return errorResponse(res, 403, "Please use the admin dashboard.");
    const payment = await query("SELECT status FROM payments WHERE user_id=$1 ORDER BY id DESC LIMIT 1", [user.id]);
    return json(res, 200, { user, paymentStatus: payment[0]?.status || "pending", planOptions: membershipPlans });
  }
  if (path === "/api/member/profile" && method === "PATCH") {
    const user = await requireUser();
    if (!user) return errorResponse(res, 401, "Please sign in to continue.");
    if (user.role !== "member") return errorResponse(res, 403, "Member account required.");
    const name = clean(body.name, 100);
    const email = clean(body.email, 160).toLowerCase();
    const phone = clean(body.phone, 30);
    const address = clean(body.address, 250);
    if (name.length < 2 || (email && !EMAIL_PATTERN.test(email)) || phone.length < 7) {
      return errorResponse(res, 400, "Enter a valid name, optional email and WhatsApp/phone number.");
    }
    const rows = await query(
      `UPDATE users SET name=$1,email=$2,phone=$3,address=$4,updated_at=now()
       WHERE id=$5 RETURNING id`,
      [name, normalizeEmail(email, user.member_id), phone, address, user.id],
    );
    if (!rows.length) return errorResponse(res, 404, "Member account not found.");
    return json(res, 200, { user: displayUser((await query(
      `SELECT id,member_id,name,email,phone,address,role,plan,custom_plan_details,
       custom_plan_amount_paise,status,membership_due_date,height_cm,weight_kg,
       profile_photo,age,gender,fitness_goal,preferred_membership,emergency_contact,created_at
       FROM users WHERE id=$1`,
      [user.id],
    ))[0]) });
  }
  if (path === "/api/member/payments" && method === "GET") {
    const user = await requireUser();
    if (!user) return errorResponse(res, 401, "Please sign in to continue.");
    if (user.role !== "member") return errorResponse(res, 403, "Member account required.");
    const payments = await query(
      "SELECT transaction_ref,amount_paise,status,method,notes,created_at FROM payments WHERE user_id=$1 ORDER BY id DESC LIMIT 100",
      [user.id],
    );
    return json(res, 200, { payments });
  }
  if (path === "/api/member/plan" && method === "PATCH") {
    const user = await requireUser();
    if (!user) return errorResponse(res, 401, "Please sign in to continue.");
    if (user.role !== "member") return errorResponse(res, 403, "Member account required.");
    const plan = clean(body.plan, 100);
    if (plan === "Custom" && user.plan === "Custom") return json(res, 200, { user, message: "Your custom package selection is unchanged." });
    if (!validPlan(plan)) return errorResponse(res, 400, "Select a valid membership plan from the available packages.");
    await query(
      "UPDATE users SET plan=$1,custom_plan_details='',custom_plan_amount_paise=NULL,updated_at=now() WHERE id=$2",
      [plan, user.id],
    );
    const updated = (await query(
      `SELECT id,member_id,name,email,phone,address,role,plan,custom_plan_details,
       custom_plan_amount_paise,status,membership_due_date,height_cm,weight_kg,
       profile_photo,age,gender,fitness_goal,preferred_membership,emergency_contact,created_at
       FROM users WHERE id=$1`,
      [user.id],
    ))[0];
    return json(res, 200, { user: displayUser(updated), message: "Package selection saved." });
  }
  if (path === "/api/member/messages" && method === "GET") {
    const user = await requireUser();
    if (!user) return errorResponse(res, 401, "Please sign in to continue.");
    if (user.role !== "member") return errorResponse(res, 403, "Member account required.");
    const messages = await query(
      "SELECT id,subject,body,image_data,sent_at,created_at FROM messages WHERE user_id=$1 AND status='sent' ORDER BY id DESC LIMIT 100",
      [user.id],
    );
    return json(res, 200, { messages });
  }

  if (path === "/api/admin/dashboard" && method === "GET") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const rows = await query(
      `SELECT
       (SELECT count(*)::integer FROM users WHERE role='member' AND archived_at IS NULL) AS members,
       (SELECT count(*)::integer FROM users WHERE role='member' AND archived_at IS NULL AND status='active') AS "activeMembers",
       (SELECT count(*)::integer FROM users WHERE role='member' AND archived_at IS NULL AND status='pending') AS "pendingMembers",
       (SELECT count(*)::integer FROM users WHERE role='member' AND archived_at IS NULL AND status='paused') AS "pausedMembers",
       (SELECT count(*)::integer FROM trainers WHERE active=TRUE) AS trainers,
       (SELECT count(*)::integer FROM enquiries WHERE status='new') AS enquiries,
       (SELECT count(*)::integer FROM payments WHERE status='pending') AS "pendingPayments",
       (SELECT count(*)::integer FROM users WHERE role='member' AND archived_at IS NULL AND membership_due_date IS NOT NULL AND membership_due_date<=CURRENT_DATE+7) AS "dueSoon"`,
    );
    return json(res, 200, { admin, stats: rows[0] });
  }

  if (path === "/api/admin/members" && method === "POST") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const name = clean(body.name, 100);
    const email = clean(body.email, 160).toLowerCase();
    const phone = clean(body.phone, 30);
    const plan = clean(body.plan, 100) || membershipPlans[0].name;
    const status = clean(body.status, 20) || "active";
    const height = Number(body.height_cm) || null;
    const weight = Number(body.weight_kg) || null;
    const photo = clean(body.profile_photo, 2500000);
    const due = clean(body.membership_due_date, 30);
    const custom = planDetails(plan, body.custom_plan_details, body.custom_plan_amount);
    if (name.length < 2 || phone.length < 7 || (email && !EMAIL_PATTERN.test(email)) || !custom.valid || !["pending", "active", "paused"].includes(status)) {
      return errorResponse(res, 400, "Enter name, phone and valid plan details. Custom plans need a description and amount greater than zero.");
    }
    if (!validDate(due)) return errorResponse(res, 400, "Membership due date must use YYYY-MM-DD.");
    const duplicate = await query("SELECT id FROM users WHERE role='member' AND phone=$1 LIMIT 1", [phone]);
    if (duplicate.length) return errorResponse(res, 409, "That phone number is already registered.");
    const temporaryPassword = `Sibi@${crypto.randomBytes(4).toString("hex").toUpperCase()}!`;
    try {
      const user = await createMember({
        name, email, phone, plan, status, height_cm: height, weight_kg: weight,
        profile_photo: photo, membership_due_date: due || null,
        customPlanDetails: custom.details, customPlanAmountPaise: custom.amountPaise,
        hash: await bcrypt.hash(temporaryPassword, 12),
      });
      return json(res, 201, { user, temporaryPassword, message: "Member created successfully." });
    } catch (error) {
      if (pgConflict(error)) return errorResponse(res, 409, "That email address is already used by another account.");
      throw error;
    }
  }
  if (path === "/api/admin/members" && method === "GET") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const archived = url.searchParams.get("archived") === "1";
    const members = await query(
      `${memberSelect} AND u.archived_at IS ${archived ? "NOT " : ""}NULL ORDER BY u.id DESC LIMIT 1000`,
    );
    return json(res, 200, { members, fetched_at: new Date().toISOString() });
  }
  if (idMatch && idMatch[1] === "members" && method === "GET" && !suffix) {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    if (!Number.isInteger(id) || id < 1) return errorResponse(res, 400, "Invalid member.");
    const rows = await query(`${memberSelect} AND u.id=$1`, [id]);
    if (!rows[0]) return errorResponse(res, 404, "Member not found.");
    return json(res, 200, { member: rows[0], fetched_at: new Date().toISOString() });
  }
  if (idMatch && idMatch[1] === "members" && method === "DELETE" && !suffix) {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    if (!Number.isInteger(id) || id < 1) return errorResponse(res, 400, "Invalid member.");
    const rows = await query(
      `WITH archived AS (
         UPDATE users SET archived_at=now(),updated_at=now()
         WHERE id=$1 AND role='member' AND archived_at IS NULL RETURNING id
       ), cancelled AS (
         UPDATE messages SET status='cancelled',delivery_status='cancelled',
           delivery_error='Cancelled because this member was removed.'
         WHERE user_id IN (SELECT id FROM archived) AND status IN ('pending','scheduled')
         RETURNING id
       )
       SELECT id FROM archived`,
      [id],
    );
    if (!rows.length) return errorResponse(res, 404, "Member not found or already removed.");
    return json(res, 200, { ok: true, message: "Member removed from the active list. Payment and message history has been preserved." });
  }
  if (idMatch && idMatch[1] === "members" && suffix === "restore" && method === "PATCH") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    if (!Number.isInteger(id) || id < 1) return errorResponse(res, 400, "Invalid member.");
    const rows = await query(
      "UPDATE users SET archived_at=NULL,updated_at=now() WHERE id=$1 AND role='member' AND archived_at IS NOT NULL RETURNING id",
      [id],
    );
    if (!rows.length) return errorResponse(res, 404, "Removed member not found.");
    return json(res, 200, { ok: true, message: "Member restored to the active member list." });
  }
  if (idMatch && idMatch[1] === "members" && suffix === "status" && method === "PATCH") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const status = clean(body.status, 20);
    if (!["pending", "active", "paused"].includes(status)) return errorResponse(res, 400, "Invalid member status.");
    const rows = await query(
      "UPDATE users SET status=$1,updated_at=now() WHERE id=$2 AND role='member' AND archived_at IS NULL RETURNING id",
      [status, id],
    );
    if (!rows.length) return errorResponse(res, 404, "Member not found.");
    return json(res, 200, { ok: true });
  }
  if (idMatch && idMatch[1] === "members" && method === "PATCH" && !suffix) {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const name = clean(body.name, 100);
    const email = clean(body.email, 160).toLowerCase();
    const phone = clean(body.phone, 30);
    const address = clean(body.address, 250);
    const plan = clean(body.plan, 100);
    const status = clean(body.status, 20);
    const due = clean(body.membership_due_date, 30);
    const height = Number(body.height_cm) || null;
    const weight = Number(body.weight_kg) || null;
    const photo = clean(body.profile_photo, 2500000);
    const paymentStatus = clean(body.payment_status, 20);
    const custom = planDetails(plan, body.custom_plan_details, body.custom_plan_amount);
    if (!Number.isInteger(id) || id < 1 || name.length < 2 || (email && !EMAIL_PATTERN.test(email)) || phone.length < 7 || !custom.valid || !["pending", "active", "paused"].includes(status) || (paymentStatus && !["pending", "completed", "failed"].includes(paymentStatus))) {
      return errorResponse(res, 400, "Check the customer name, email, phone, plan details, membership status and payment status. Custom plans need a description and amount greater than zero.");
    }
    if (!validDate(due)) return errorResponse(res, 400, "Membership due date must use YYYY-MM-DD.");
    const member = (await query("SELECT member_id FROM users WHERE id=$1 AND role='member' AND archived_at IS NULL", [id]))[0];
    if (!member) return errorResponse(res, 404, "Member not found.");
    const duplicate = await query("SELECT id FROM users WHERE role='member' AND phone=$1 AND id<>$2 LIMIT 1", [phone, id]);
    if (duplicate.length) return errorResponse(res, 409, "That phone number is already registered to another member.");
    try {
      await query(
        `UPDATE users SET name=$1,email=$2,phone=$3,address=$4,plan=$5,
         custom_plan_details=$6,custom_plan_amount_paise=$7,status=$8,membership_due_date=$9,
         height_cm=$10,weight_kg=$11,profile_photo=$12,updated_at=now()
         WHERE id=$13 AND role='member' AND archived_at IS NULL`,
        [name, normalizeEmail(email, member.member_id), phone, address, plan, custom.details, custom.amountPaise, status, due || null, height, weight, photo, id],
      );
      if (paymentStatus) {
        await query(
          `UPDATE payments SET status=$1,updated_at=now()
           WHERE id=(SELECT id FROM payments WHERE user_id=$2 ORDER BY id DESC LIMIT 1)`,
          [paymentStatus, id],
        );
      }
      const updated = await query(`${memberSelect} AND u.id=$1`, [id]);
      return json(res, 200, { ok: true, member: updated[0] });
    } catch (error) {
      if (pgConflict(error)) return errorResponse(res, 409, "That email address is already used by another account.");
      throw error;
    }
  }

  if (path === "/api/admin/payments" && method === "GET") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const payments = await query(
      `SELECT p.id,p.transaction_ref,p.user_id,u.member_id,u.name,u.email,u.phone,
       p.amount_paise,p.status,p.method,p.notes,p.created_at,p.updated_at
       FROM payments p JOIN users u ON u.id=p.user_id WHERE u.role='member' ORDER BY p.id DESC LIMIT 1000`,
    );
    return json(res, 200, { payments });
  }
  if (path === "/api/admin/payments" && method === "POST") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const userId = Number(body.user_id);
    const amount = Number(body.amount);
    const status = clean(body.status, 20);
    const methodName = clean(body.method, 40) || "cash";
    const notes = clean(body.notes, 500);
    if (!Number.isInteger(userId) || userId < 1 || !Number.isFinite(amount) || amount <= 0 || amount > 10000000 || !["pending", "completed", "failed"].includes(status) || !["cash", "card", "gpay", "bank_transfer"].includes(methodName)) {
      return errorResponse(res, 400, "Choose a customer, valid amount, status and payment method.");
    }
    const user = await query("SELECT id FROM users WHERE id=$1 AND role='member'", [userId]);
    if (!user.length) return errorResponse(res, 404, "Member not found.");
    const reference = `SSC-MAN-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const rows = await query(
      `INSERT INTO payments (transaction_ref,user_id,amount_paise,status,method,notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [reference, userId, Math.round(amount * 100), status, methodName, notes],
    );
    return json(res, 201, { payment: rows[0], message: "Payment record saved." });
  }
  if (idMatch && idMatch[1] === "payments" && method === "PATCH" && !suffix) {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const status = clean(body.status, 20);
    if (!["pending", "completed", "failed"].includes(status)) return errorResponse(res, 400, "Invalid payment status.");
    const rows = await query("UPDATE payments SET status=$1,updated_at=now() WHERE id=$2 RETURNING id", [status, id]);
    if (!rows.length) return errorResponse(res, 404, "Payment record not found.");
    return json(res, 200, { ok: true });
  }

  if (path === "/api/admin/templates" && method === "GET") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const rows = await query("SELECT id,name,category,subject,body,created_at,updated_at FROM message_templates ORDER BY id");
    return json(res, 200, { templates: rows });
  }
  if (path === "/api/admin/templates" && method === "POST") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const name = clean(body.name, 100);
    const category = clean(body.category, 40);
    const subject = clean(body.subject, 160);
    const message = clean(body.body, 3000);
    if (!name || !category || !message) return errorResponse(res, 400, "Template name, category and message are required.");
    const existing = (await query("SELECT id FROM message_templates WHERE lower(name)=lower($1)", [name]))[0];
    if (existing) {
      const rows = await query(
        `UPDATE message_templates SET category=$1,subject=$2,body=$3,updated_at=now()
         WHERE id=$4 RETURNING *`,
        [category, subject, message, existing.id],
      );
      return json(res, 200, { template: rows[0], updated: true, message: "Template updated in your library." });
    }
    const rows = await query(
      "INSERT INTO message_templates (name,category,subject,body) VALUES ($1,$2,$3,$4) RETURNING *",
      [name, category, subject, message],
    );
    return json(res, 201, { template: rows[0], message: "Template saved to your library." });
  }
  if (idMatch && idMatch[1] === "templates" && method === "PATCH" && !suffix) {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const name = clean(body.name, 100);
    const category = clean(body.category, 40);
    const subject = clean(body.subject, 160);
    const message = clean(body.body, 3000);
    if (!name || !category || !message) return errorResponse(res, 400, "Template name, category and message are required.");
    const rows = await query(
      `UPDATE message_templates SET name=$1,category=$2,subject=$3,body=$4,updated_at=now()
       WHERE id=$5 RETURNING *`,
      [name, category, subject, message, id],
    );
    if (!rows.length) return errorResponse(res, 404, "Template not found.");
    return json(res, 200, { template: rows[0] });
  }
  if (idMatch && idMatch[1] === "templates" && method === "DELETE" && !suffix) {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const rows = await query("DELETE FROM message_templates WHERE id=$1 RETURNING id", [id]);
    if (!rows.length) return errorResponse(res, 404, "Template not found.");
    return json(res, 200, { ok: true });
  }

  if (path === "/api/admin/whatsapp/status" && method === "GET") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    return json(res, 200, {
      provider: "manual", configured: false, connected: false,
      message: "WhatsApp automation is disabled on Vercel. Messages can be prepared for manual handling; scheduled delivery is paused.",
    });
  }
  if (path === "/api/admin/messages/ready" && method === "GET") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const rows = await query("SELECT id FROM messages WHERE delivery_status='manual_ready' ORDER BY id DESC LIMIT 500");
    return json(res, 200, { ids: rows.map((row) => row.id) });
  }
  if (path === "/api/admin/messages" && method === "GET") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const messages = await query(
      `SELECT m.id,m.user_id,coalesce(nullif(m.recipient_member_id,''),u.member_id,'Enquiry') AS member_id,
       coalesce(nullif(m.recipient_name,''),u.name,'Unknown recipient') AS name,
       coalesce(nullif(m.recipient_phone,''),u.phone,'') AS phone,m.subject,m.body,m.image_data,
       m.delivery_mode,m.scheduled_at,m.sent_at,m.status,m.delivery_status,m.delivery_error,
       m.template_id,m.provider_message_id,m.created_at,t.name AS template_name
       FROM messages m LEFT JOIN users u ON u.id=m.user_id
       LEFT JOIN message_templates t ON t.id=m.template_id ORDER BY m.id DESC LIMIT 500`,
    );
    return json(res, 200, { messages });
  }
  if (idMatch && idMatch[1] === "messages" && suffix === "complete" && method === "POST") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const rows = await query(
      `UPDATE messages SET status='sent',sent_at=now(),delivery_status='manual_sent',
       delivery_error='Marked complete manually; WhatsApp delivery was not verified.'
       WHERE id=$1 AND delivery_status='manual_ready' AND status='pending' RETURNING id`,
      [id],
    );
    if (!rows.length) return errorResponse(res, 409, "This reminder is no longer waiting to be marked complete. Refresh delivery history.");
    return json(res, 200, { ok: true, message: "Reminder marked completed. WhatsApp delivery was not verified." });
  }
  if (path === "/api/admin/messages/bulk" && method === "POST") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const requestedRecipients = Array.isArray(body.recipients) ? body.recipients : [];
    const templateId = Number(body.template_id) || null;
    const subject = clean(body.subject, 160);
    const message = clean(body.body, 3000);
    const image = clean(body.image_data, 2500000);
    const mode = clean(body.delivery_mode, 30) || "manual";
    const scheduled = clean(body.scheduled_at, 80);
    const audienceType = clean(body.audience_type, 20) || "members";
    const audiencePlan = clean(body.audience_plan, 100);
    const audienceSearch = clean(body.audience_search, 120).toLowerCase();
    if (!message || !["manual", "automatic", "scheduled_selected"].includes(mode)) return errorResponse(res, 400, "Enter a message before sending.");
    if (!["members", "active", "pending", "renewals", "enquiries"].includes(audienceType)) return errorResponse(res, 400, "Choose a valid recipient group.");
    if (templateId && !(await query("SELECT id FROM message_templates WHERE id=$1", [templateId])).length) return errorResponse(res, 400, "Selected message template is no longer available.");
    if (image && !/^data:image\/(png|jpe?g|webp);base64,/i.test(image)) return errorResponse(res, 400, "Please select a PNG, JPG or WebP image.");
    const isScheduled = mode !== "manual";
    const filterSchedule = mode === "automatic";
    let recipients = [];
    if (isScheduled && !scheduled) return errorResponse(res, 400, "Choose a future date and time for scheduled delivery.");
    if (filterSchedule && audienceType === "enquiries") {
      const params = [];
      let where = "status='new' AND converted_user_id IS NULL";
      if (audienceSearch) {
        params.push(`%${audienceSearch}%`);
        where += ` AND lower(name || ' ' || phone || ' ' || email || ' ' || topic || ' ' || place) LIKE $${params.length}`;
      }
      recipients = await query(
        `SELECT id,name,phone,'' AS member_id,'' AS plan,'enquiry' AS type FROM enquiries WHERE ${where} ORDER BY id DESC`,
        params,
      );
    } else if (filterSchedule) {
      const params = [];
      let where = "role='member' AND archived_at IS NULL";
      if (audienceType === "active" || audienceType === "pending") {
        params.push(audienceType);
        where += ` AND status=$${params.length}`;
      }
      if (audienceType === "renewals") where += " AND membership_due_date IS NOT NULL AND membership_due_date<=CURRENT_DATE+7";
      if (validPlan(audiencePlan) || audiencePlan === "Custom") {
        params.push(audiencePlan);
        where += ` AND plan=$${params.length}`;
      }
      if (audienceSearch) {
        params.push(`%${audienceSearch}%`);
        where += ` AND lower(name || ' ' || member_id || ' ' || phone || ' ' || coalesce(email,'')) LIKE $${params.length}`;
      }
      recipients = await query(
        `SELECT id,name,phone,member_id,plan,'member' AS type FROM users WHERE ${where} ORDER BY id DESC`,
        params,
      );
    } else {
      const refs = requestedRecipients.map((item) => ({ type: item?.type, id: Number(item?.id) }))
        .filter((item) => ["member", "enquiry"].includes(item.type) && Number.isInteger(item.id) && item.id > 0);
      const unique = [...new Map(refs.map((item) => [`${item.type}:${item.id}`, item])).values()];
      const memberIds = unique.filter((item) => item.type === "member").map((item) => item.id);
      const enquiryIds = unique.filter((item) => item.type === "enquiry").map((item) => item.id);
      if (memberIds.length) recipients.push(...await query(
        `SELECT id,name,phone,member_id,plan,'member' AS type FROM users
         WHERE role='member' AND archived_at IS NULL AND id=ANY($1::int[])`,
        [memberIds],
      ));
      if (enquiryIds.length) recipients.push(...await query(
        `SELECT id,name,phone,'' AS member_id,'' AS plan,'enquiry' AS type FROM enquiries
         WHERE status='new' AND converted_user_id IS NULL AND id=ANY($1::int[])`,
        [enquiryIds],
      ));
    }
    if (!recipients.length) return errorResponse(res, 400, isScheduled ? "No recipients match the selected group and filters." : "Select at least one recipient to send this message to.");
    let scheduledAt = null;
    if (isScheduled) {
      const parsed = parseScheduledDate(scheduled);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) return errorResponse(res, 400, "Choose a valid future date and time for scheduled delivery.");
      scheduledAt = parsed.toISOString();
    }
    const missing = recipients.filter((recipient) => !validPhone(recipient.phone));
    if (missing.length) return errorResponse(res, 400, `Add a valid WhatsApp phone number with country code for: ${missing.map((item) => item.name).join(", ")}.`);
    const storedMode = isScheduled ? "automatic" : "manual";
    const storedStatus = isScheduled ? "scheduled" : "pending";
    const deliveryStatus = isScheduled ? "paused" : "manual_ready";
    const sentAt = null;
    const inserted = [];
    for (const recipient of recipients) {
      const memberId = recipient.member_id || "";
      const finalMessage = message
        .replace(/{{name}}/g, recipient.name)
        .replace(/{{member_id}}/g, memberId)
        .replace(/{{plan}}/g, recipient.plan || "")
        .replace(/{{date}}/g, scheduledAt ? new Date(scheduledAt).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN"));
      const userId = recipient.type === "member" ? recipient.id : null;
      const rows = await query(
        `INSERT INTO messages
         (user_id,template_id,subject,body,image_data,recipient_name,recipient_member_id,
          recipient_phone,delivery_mode,scheduled_at,sent_at,status,created_by,delivery_status,delivery_error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
        [
          userId, templateId, subject, finalMessage, image, recipient.name, memberId,
          recipient.phone, storedMode, scheduledAt, sentAt, storedStatus, admin.id,
          deliveryStatus,
          isScheduled ? "Scheduled WhatsApp delivery is paused on Vercel; no message will be sent automatically." : "Ready to send manually: open WhatsApp from Delivery history.",
        ],
      );
      inserted.push(rows[0].id);
    }
    if (isScheduled) {
      return json(res, 201, {
        count: inserted.length, status: "scheduled",
        message: `${inserted.length} reminder${inserted.length === 1 ? "" : "s"} saved. WhatsApp sending is paused on Vercel; these reminders will not be sent automatically.`,
      });
    }
    return json(res, 202, {
      count: inserted.length, status: "manual_ready",
      message: `${inserted.length} message${inserted.length === 1 ? "" : "s"} ready. Open WhatsApp from Delivery history and press Send. Automatic sending is disabled.`,
    });
  }
  if (path === "/api/admin/messages/retry" && method === "POST") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    return errorResponse(res, 503, "Automatic WhatsApp delivery is disabled on Vercel. Messages are not sent by retry.");
  }

  if (path === "/api/admin/trainers" && method === "POST") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const name = clean(body.name, 100);
    const specialty = clean(body.specialty, 120);
    const bio = clean(body.bio, 1000);
    const certifications = clean(body.certifications, 300);
    const photo = clean(body.photo_url, 500);
    const experience = Number(body.experience_years);
    if (name.length < 2) return errorResponse(res, 400, "Enter a trainer name with at least 2 characters.");
    if (specialty.length < 2) return errorResponse(res, 400, "Enter a specialty with at least 2 characters.");
    if (bio.length < 10) return errorResponse(res, 400, "Enter a trainer bio with at least 10 characters.");
    if (!Number.isInteger(experience) || experience < 0 || experience > 60) return errorResponse(res, 400, "Enter a whole number of years from 0 to 60.");
    const rows = await query(
      `INSERT INTO trainers (name,specialty,experience_years,bio,certifications,photo_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, specialty, experience, bio, certifications, photo],
    );
    return json(res, 201, { trainer: rows[0] });
  }
  if (idMatch && idMatch[1] === "trainers" && method === "DELETE" && !suffix) {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const rows = await query("UPDATE trainers SET active=FALSE WHERE id=$1 AND active=TRUE RETURNING id", [id]);
    if (!rows.length) return errorResponse(res, 404, "Trainer not found.");
    return json(res, 200, { ok: true });
  }
  if (path === "/api/admin/enquiries" && method === "GET") {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const enquiries = await query(
      `SELECT e.*,u.member_id AS converted_member_id FROM enquiries e
       LEFT JOIN users u ON u.id=e.converted_user_id ORDER BY e.id DESC LIMIT 500`,
    );
    return json(res, 200, { enquiries, fetched_at: new Date().toISOString() });
  }
  if (idMatch && idMatch[1] === "enquiries" && method === "PATCH" && !suffix) {
    const admin = await requireAdmin();
    if (!admin) return errorResponse(res, 403, "Administrator access required.");
    const status = clean(body.status, 20);
    if (!["new", "contacted", "closed"].includes(status)) return errorResponse(res, 400, "Invalid enquiry status.");
    const enquiry = (await query("SELECT * FROM enquiries WHERE id=$1", [id]))[0];
    if (!enquiry) return errorResponse(res, 404, "Enquiry not found.");
    if (status !== "closed") {
      await query("UPDATE enquiries SET status=$1 WHERE id=$2", [status, id]);
      return json(res, 200, { ok: true, status, message: "Enquiry status saved." });
    }
    let userId = enquiry.converted_user_id || null;
    let temporaryPassword = "";
    if (!userId) {
      const normalizedEmail = (enquiry.email || "").trim().toLowerCase();
      const existing = normalizedEmail
        ? (await query("SELECT id FROM users WHERE role='member' AND lower(email)=$1 AND email NOT LIKE '%@member.local' LIMIT 1", [normalizedEmail]))[0]
        : (await query("SELECT id FROM users WHERE role='member' AND phone=$1 ORDER BY id LIMIT 1", [enquiry.phone]))[0];
      if (existing) {
        userId = existing.id;
      } else {
        temporaryPassword = `Sibi@${crypto.randomBytes(4).toString("hex").toUpperCase()}!`;
        const user = await createMember({
          name: enquiry.name, email: normalizedEmail, phone: enquiry.phone, address: enquiry.place,
          plan: "Basic", status: "pending", hash: await bcrypt.hash(temporaryPassword, 12),
        });
        userId = user.id;
      }
    }
    await query("UPDATE enquiries SET status='closed',converted_user_id=$1 WHERE id=$2", [userId, id]);
    const member = (await query(`${memberSelect} AND u.id=$1`, [userId]))[0];
    return json(res, 200, {
      ok: true, status: "closed", converted: true, member, temporaryPassword,
      message: temporaryPassword ? "Enquiry closed and new member created successfully." : "Enquiry closed and linked to the existing member.",
    });
  }

  return errorResponse(res, 404, "API route not found.");
}

module.exports = async function vercelApi(req, res) {
  try {
    await handle(req, res);
  } catch (error) {
    if (error?.status === 413) return errorResponse(res, 413, error.message);
    if (error instanceof SyntaxError) return errorResponse(res, 400, "Request body must contain valid JSON.");
    if (error?.code === "23505") return errorResponse(res, 409, "That email address or record is already in use.");
    console.error("Vercel API request failed:", error);
    if (!res.headersSent) {
      const message = process.env.NODE_ENV === "production"
        ? (error?.message?.includes("DATABASE_URL") || error?.message?.includes("environment settings") || error?.message?.includes("SESSION_SECRET") || error?.message?.includes("ADMIN_")
          ? error.message
          : "The Sibi API could not complete this request.")
        : String(error?.message || "The Sibi API could not complete this request.");
      return errorResponse(res, 503, message);
    }
    res.end();
  }
};
