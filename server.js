// ==========================================
// LuaSpark — Direct API Version (no Assistant)
// ==========================================
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const API_KEY = process.env.OPENAI_API_KEY;
const BYPASS_EMAIL = process.env.BYPASS_EMAIL?.toLowerCase();

// Simulated local user store (no DB)
const users = new Map();

function makeToken(email) {
  return Buffer.from(`${email}:${Date.now()}:${Math.random()}`).toString("base64");
}

function userByToken(token) {
  if (!token) return null;
  return [...users.values()].find((u) => u.token === token);
}

// Serve frontend files
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// AUTH
app.post("/signup", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.json({ error: "Email and password required." });
  if (users.has(email)) return res.json({ error: "User already exists." });
  users.set(email, { password, hasPaid: false });
  res.json({ success: true });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);
  if (!user || user.password !== password) return res.json({ error: "Invalid credentials." });

  const token = makeToken(email);
  user.token = token;
  if (email.toLowerCase() === BYPASS_EMAIL) user.hasPaid = true;
  res.json({ token, hasPaid: user.hasPaid });
});

// GENERATE endpoint (direct OpenAI API)
app.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body;
    const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
    const user = userByToken(token);

    if (!user) return res.status(401).json({ error: "Unauthorized." });
    if (!user.hasPaid) return res.status(402).json({ error: "Payment required." });
    if (!prompt) return res.status(400).json({ error: "No prompt provided." });

    // Send prompt to OpenAI directly
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are LuaSpark. Output clean Roblox LuaU scripts only, with explanations as comments." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const output = data.choices?.[0]?.message?.content?.trim() || "-- No output --";
    res.json({ output });
  } catch (err) {
    console.error("[/generate] error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

// Frontend fallback
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`✅ LuaSpark running on http://localhost:${PORT}`));
