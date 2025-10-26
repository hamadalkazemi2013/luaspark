// ---------------------------
// LuaSpark v7 Hybrid Server
// Clean, Stable, Token-Based, PayPal-Ready
// ---------------------------

import express from "express";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = "./users.json";

// ---------------------------
// MIDDLEWARE
// ---------------------------
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// ---------------------------
// DATABASE
// ---------------------------
let users = new Map();

function loadUsers() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
      users = new Map(Object.entries(data));
      console.log(`[INIT] Loaded ${users.size} users.`);
    } catch (err) {
      console.error("[INIT] Error reading users.json:", err);
      users = new Map();
    }
  } else {
    fs.writeFileSync(DB_PATH, "{}");
    console.log("[INIT] Created new users.json");
  }
}

function saveUsers() {
  fs.writeFileSync(DB_PATH, JSON.stringify(Object.fromEntries(users), null, 2));
}
loadUsers();
setInterval(saveUsers, 60 * 1000);

// ---------------------------
// HELPERS
// ---------------------------
const normalize = (v) => (v || "").trim().toLowerCase();
const genToken = () =>
  Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const findByToken = (t) => [...users.values()].find((u) => u.token === t);
const BYPASS_EMAIL = normalize(process.env.BYPASS_EMAIL || "hamadalkazemi2013@gmail.com");

// ---------------------------
// OPENAI INIT
// ---------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------------------------
// AUTH ROUTES
// ---------------------------
app.post("/signup", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required." });

  const e = normalize(email);
  if (users.has(e)) return res.status(400).json({ error: "User already exists." });

  const token = genToken();
  users.set(e, { email: e, password, token, hasPaid: false, memory: [] });
  saveUsers();
  console.log(`[SIGNUP] ${e}`);
  res.json({ token });
});

app.post("/signin", (req, res) => {
  const { email, password } = req.body;
  const e = normalize(email);
  const user = users.get(e);
  if (!user || user.password !== password)
    return res.status(401).json({ error: "Invalid credentials." });
  res.json({ token: user.token, hasPaid: user.hasPaid });
});

app.post("/verifyToken", (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "").trim();
  const user = findByToken(token);
  if (!token || !user) return res.status(401).json({ valid: false });
  res.json({ valid: true, email: user.email, hasPaid: user.hasPaid });
});

// ---------------------------
// GENERATE ENDPOINT
// ---------------------------
app.post("/generate", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.replace("Bearer ", "").trim();
    const { prompt } = req.body;

    if (!token) return res.status(403).json({ error: "Unauthorized." });
    const user = findByToken(token);
    if (!user) return res.status(403).json({ error: "Unauthorized." });

    const bypass = normalize(user.email) === BYPASS_EMAIL;
    if (!user.hasPaid && !bypass)
      return res.status(403).json({ error: "Payment required." });

    if (!prompt) return res.status(400).json({ error: "Missing prompt." });

    if (!user.memory) user.memory = [];
    user.memory.push({ role: "user", content: prompt });
    if (user.memory.length > 10) user.memory = user.memory.slice(-10);

    const systemPrompt = `
You are LuaSpark, an expert AI Roblox LuaU engineer.
You ALWAYS return your response in this format:

CODE:
<Roblox LuaU code here>

---

EXPLANATION:
<Short, clear explanation>
`;

    const messages = [{ role: "system", content: systemPrompt }, ...user.memory];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.4,
      max_tokens: 1000,
    });

    const rawOutput =
      completion.choices?.[0]?.message?.content?.trim() || "No output generated.";
    user.memory.push({ role: "assistant", content: rawOutput });

    const [_, codePart, explanationPart] =
      rawOutput.match(/CODE:\s*([\s\S]*?)---\s*EXPLANATION:\s*([\s\S]*)/i) || [];
    const output = codePart?.trim() || rawOutput;
    const explanation =
      explanationPart?.trim() || "No explanation provided.";

    saveUsers();
    console.log(`[GENERATE] ${user.email}`);
    res.json({ output, explanation });
  } catch (err) {
    console.error("[/generate]", err);
    res.status(500).json({ error: err.message || "Server error." });
  }
});

// ---------------------------
// PAYMENT ENDPOINTS
// ---------------------------
app.post("/markPaid", (req, res) => {
  const { email } = req.body;
  const e = normalize(email);
  const user = users.get(e);
  if (!user) return res.status(404).json({ error: "User not found." });

  user.hasPaid = true;
  saveUsers();
  console.log(`[PAID] ${e}`);
  res.json({ ok: true });
});

// PayPal webhook to auto-mark paid
app.post("/paypal-webhook", (req, res) => {
  const { email, paymentStatus } = req.body;
  const e = normalize(email);
  if (!email) return res.status(400).json({ error: "Missing email." });

  if (!users.has(e)) {
    console.warn(`[WEBHOOK] Creating new user for ${email}`);
    users.set(e, { email: e, password: null, token: genToken(), hasPaid: false });
  }

  if (paymentStatus === "COMPLETED") {
    const u = users.get(e);
    u.hasPaid = true;
    users.set(e, u);
    saveUsers();
    console.log(`[PAYPAL ✅] ${email} marked as paid.`);
  }
  res.json({ ok: true });
});

// ---------------------------
// START SERVER
// ---------------------------
app.listen(PORT, () => {
  console.log(`✅ LuaSpark v7 backend live → http://localhost:${PORT}`);
});
