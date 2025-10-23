// LuaSpark API v1.3 — Localhost Edition
// Features:
// - Auth (Sign Up / Sign In)
// - 3-device session limit
// - Paid-only generation gate
// - Secure CORS + Helmet
// - Localhost-ready for development

import express from "express";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import OpenAI from "openai";

const PORT = 5000;
const USERS_DB = "./users.json";

// ⚠️ Hardcoded keys — keep local only!
const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY";
const ASSISTANT_ID = "YOUR_ASSISTANT_ID";
const BYPASS_EMAIL = "Hamadalkazemi2013@gmail.com";

const app = express();
app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json({ limit: "200kb" }));

// ===== Load & Save Users =====
async function loadUsers() {
  try {
    const txt = await fs.readFile(USERS_DB, "utf8");
    return JSON.parse(txt);
  } catch {
    return [];
  }
}
async function saveUsers(users) {
  await fs.writeFile(USERS_DB, JSON.stringify(users, null, 2), "utf8");
}

// ===== Sessions =====
const sessions = new Map(); // token => email
const activeSessions = new Map(); // email => [tokens]

// ===== OpenAI =====
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ===== Middleware =====
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const email = sessions.get(token);
  if (!email) return res.status(401).json({ error: "Unauthorized" });
  req.authedEmail = email;
  next();
}

// ===== AUTH =====
app.post("/signup", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.json({ success: false, error: "Email and password required." });

  const users = await loadUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.json({ success: false, error: "User already exists." });
  }

  const password_hash = await bcrypt.hash(password, 10);
  users.push({ email, password_hash, hasPaid: false });
  await saveUsers(users);

  res.json({ success: true });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const users = await loadUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return res.json({ error: "User not found." });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.json({ error: "Invalid credentials." });

  const token = uuidv4();
  sessions.set(token, user.email);

  // 3-device session limit
  const arr = activeSessions.get(user.email) || [];
  arr.push(token);
  while (arr.length > 3) {
    const old = arr.shift();
    sessions.delete(old);
  }
  activeSessions.set(user.email, arr);

  res.json({ token, hasPaid: !!user.hasPaid });
});

// ===== GENERATE (Paid Only) =====
app.post("/generate", requireAuth, async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "Prompt required." });

  const email = req.authedEmail.toLowerCase();
  const users = await loadUsers();
  const user = users.find(u => u.email.toLowerCase() === email);
  const isBypass = email === BYPASS_EMAIL.toLowerCase();
  const isPaid = user?.hasPaid;

  if (!isBypass && !isPaid) {
    return res.status(402).json({ error: "Payment required." });
  }

  try {
    const thread = await openai.beta.threads.create();
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: prompt,
    });
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID,
    });

    // Poll until finished
    let status = run.status;
    const start = Date.now();
    while (!["completed", "failed", "cancelled", "expired"].includes(status)) {
      if (Date.now() - start > 60000)
        return res.status(504).json({ error: "Timeout" });
      await new Promise(r => setTimeout(r, 1200));
      const cur = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = cur.status;
    }

    if (status !== "completed")
      return res.status(500).json({ error: "Run failed: " + status });

    const msgs = await openai.beta.threads.messages.list(thread.id, {
      order: "desc",
      limit: 5,
    });
    const assistantMsg = msgs.data.find(m => m.role === "assistant");
    let text = "";
    if (assistantMsg && assistantMsg.content) {
      text = assistantMsg.content
        .map(c => (c.type === "text" ? c.text.value : ""))
        .join("\n")
        .trim();
    }
    res.json({ output: text || "(No output returned.)" });
  } catch (err) {
    console.error("OpenAI error", err);
    res.status(500).json({ error: "OpenAI error." });
  }
});

app.listen(PORT, () =>
  console.log(`🚀 LuaSpark API running at http://localhost:${PORT}`)
);
