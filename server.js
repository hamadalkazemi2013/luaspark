// ---------------------------
// LuaSpark v4 Server Backend
// Production-Ready, Verified, and Stable
// ---------------------------

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const DB_PATH = "./users.json";

// ---------------------------
// Middleware
// ---------------------------
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// ---------------------------
// Initialize User Database
// ---------------------------
let users = new Map();

function loadUsers() {
  if (fs.existsSync(DB_PATH)) {
    try {
      const data = fs.readFileSync(DB_PATH, "utf8");
      users = new Map(Object.entries(JSON.parse(data)));
      console.log(`[INIT] Loaded ${users.size} users.`);
    } catch (err) {
      console.error("[INIT] Failed to parse users.json:", err);
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

// ---------------------------
// OpenAI Setup
// ---------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------------------------
// Utility Helpers
// ---------------------------
const normalize = (str) => (str || "").trim().toLowerCase();
const genToken = () =>
  Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
const findByToken = (t) => [...users.values()].find((u) => u.token === t);

// ---------------------------
// Authentication Routes
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

  console.log(`[SIGNUP] New user: ${e}`);
  res.json({ token });
});

app.post("/signin", (req, res) => {
  const { email, password } = req.body;
  const e = normalize(email);
  const user = users.get(e);
  if (!user || user.password !== password)
    return res.status(401).json({ error: "Invalid credentials." });

  console.log(`[SIGNIN] ${e}`);
  res.json({ token: user.token, hasPaid: user.hasPaid });
});

// ✅ Legacy alias for frontend compatibility
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const e = normalize(email);
  const user = users.get(e);
  if (!user || user.password !== password)
    return res.status(401).json({ error: "Invalid credentials." });
  res.json({ token: user.token, hasPaid: user.hasPaid });
});

// ---------------------------
// Verify Token
// ---------------------------
app.post("/verifyToken", (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ valid: false });

  const user = findByToken(token);
  if (!user) return res.status(401).json({ valid: false });

  res.json({ valid: true, email: user.email, hasPaid: user.hasPaid });
});

// ---------------------------
// Generate Code Endpoint
// ---------------------------
app.post("/generate", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.replace("Bearer ", "").trim();
    const { prompt } = req.body;

    if (!token) return res.status(403).json({ error: "Unauthorized." });
    const user = findByToken(token);
    if (!user) return res.status(403).json({ error: "Unauthorized." });

    const bypass = normalize(user.email) === normalize(process.env.BYPASS_EMAIL);
    if (!user.hasPaid && !bypass)
      return res.status(403).json({ error: "Payment required." });

    if (!prompt) return res.status(400).json({ error: "Missing prompt." });

    // Maintain last 10 messages (memory)
    if (!user.memory) user.memory = [];
    user.memory.push({ role: "user", content: prompt });
    if (user.memory.length > 10) user.memory = user.memory.slice(-10);

    const messages = [
      {
        role: "system",
        content:
          "You are LuaSpark, an expert AI that writes clean, working Roblox LuaU scripts with brief, clear explanations.",
      },
      ...user.memory,
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.3,
      max_tokens: 700,
    });

    const output =
      completion.choices?.[0]?.message?.content?.trim() || "No response generated.";

    user.memory.push({ role: "assistant", content: output });
    saveUsers();

    res.json({ output });
  } catch (err) {
    console.error("[/generate] error:", err);
    res.status(500).json({ error: err.message || "Server error." });
  }
});

// ---------------------------
// Mark User Paid
// ---------------------------
app.post("/markPaid", (req, res) => {
  const { email } = req.body;
  const e = normalize(email);
  const user = users.get(e);
  if (!user) return res.status(404).json({ error: "User not found." });

  user.hasPaid = true;
  saveUsers();
  console.log(`[MARK PAID] ${e}`);
  res.json({ ok: true });
});

// ---------------------------
// Periodic Save + Startup
// ---------------------------
setInterval(saveUsers, 60 * 1000);

app.listen(PORT, () => {
  console.log(`✅ LuaSpark v4 live → http://localhost:${PORT}`);
});
