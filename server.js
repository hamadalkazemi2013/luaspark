// ---------------------------
// LuaSpark v3 Server Backend
// Context-Aware, Fast, and Stable
// ---------------------------

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ---------------------------
// Middleware
// ---------------------------
app.use(express.json());
app.use(cors());
app.use(express.static("public"));

// ---------------------------
// Load / Save Users
// ---------------------------
let users = new Map();
const dbPath = "./users.json";

function loadUsers() {
  if (fs.existsSync(dbPath)) {
    const data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    users = new Map(Object.entries(data));
    console.log(`[INIT] Loaded ${users.size} users from DB.`);
  } else {
    fs.writeFileSync(dbPath, "{}");
    console.log("[INIT] Created new users.json");
  }
}

function saveUsers() {
  fs.writeFileSync(dbPath, JSON.stringify(Object.fromEntries(users), null, 2));
}

loadUsers();

// ---------------------------
// OpenAI Setup
// ---------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------------------
// Auth Routes
// ---------------------------
app.post("/signup", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required." });

  if (users.has(email))
    return res.status(400).json({ error: "User already exists." });

  const token = Math.random().toString(36).substring(2);
  users.set(email, { email, password, token, hasPaid: false, memory: [] });
  saveUsers();
  res.json({ token });
});

app.post("/signin", (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user || user.password !== password)
    return res.status(401).json({ error: "Invalid credentials." });

  res.json({ token: user.token });
});

// ---------------------------
// Generate Endpoint (Memory + Bypass)
// ---------------------------
app.post("/generate", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    const { prompt } = req.body;

    if (!token) return res.status(403).json({ error: "Unauthorized." });
    const user = [...users.values()].find((u) => u.token === token);
    if (!user) return res.status(403).json({ error: "Unauthorized." });

    const isBypassUser =
      user.email?.toLowerCase?.() ===
      process.env.BYPASS_EMAIL?.toLowerCase?.();

    if (!user.hasPaid && !isBypassUser)
      return res.status(403).json({ error: "Payment required." });

    if (!prompt)
      return res.status(400).json({ error: "No prompt provided." });

    // ---------------------------
    // Memory Logic
    // ---------------------------
    if (!user.memory) user.memory = [];
    user.memory.push({ role: "user", content: prompt });

    // Keep last 10 exchanges
    if (user.memory.length > 10) user.memory = user.memory.slice(-10);

    const messages = [
      {
        role: "system",
        content:
          "You are LuaSpark, an AI assistant that generates functional Roblox LuaU scripts. Always respond with code and short explanations when needed.",
      },
      ...user.memory,
    ];

    // ---------------------------
    // OpenAI API Call
    // ---------------------------
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.3,
      max_tokens: 700,
    });

    const output =
      completion.choices?.[0]?.message?.content?.trim() ||
      "No response generated.";

    // Store assistant reply in memory
    user.memory.push({ role: "assistant", content: output });
    saveUsers();

    res.json({ output });
  } catch (err) {
    console.error("[/generate] error:", err);
    res.status(500).json({
      error: err.message || "Server error.",
    });
  }
});

// ---------------------------
// Periodic Save
// ---------------------------
setInterval(saveUsers, 60 * 1000);

// ---------------------------
// Start Server
// ---------------------------
app.listen(PORT, () =>
  console.log(`✅ LuaSpark v3 live → http://localhost:${PORT}`)
);
