// ==========================
// LuaSpark Server — Final Build
// ==========================
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// ---------- CONFIG ----------
const app = express();
app.use(express.json());
app.use(cors());

// Correct path setup for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static frontend (public folder)
app.use(express.static(path.join(__dirname, "public")));

// ---------- IN-MEMORY DATABASE ----------
const users = new Map(); // { email: { password, token, hasPaid } }

// Helper function to create simple tokens
function makeToken(email) {
  return Buffer.from(`${email}:${Date.now()}`).toString("base64");
}

// ---------- AUTH ROUTES ----------
app.post("/signup", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.json({ error: "Email and password required." });

  if (users.has(email))
    return res.json({ error: "User already exists." });

  users.set(email, { password, hasPaid: false });
  res.json({ success: true });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.get(email);

  if (!user || user.password !== password)
    return res.json({ error: "Invalid email or password." });

  const token = makeToken(email);
  user.token = token;

  res.json({ token, hasPaid: user.hasPaid });
});

// ---------- GENERATOR ----------
app.post("/generate", async (req, res) => {
  const { prompt } = req.body;
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  const user = [...users.values()].find((u) => u.token === token);

  if (!user) return res.status(403).json({ error: "Unauthorized." });
  if (!user.hasPaid) return res.status(403).json({ error: "Payment required." });
  if (!prompt) return res.json({ error: "No prompt provided." });

  // Mock response (replace later with OpenAI call)
  const output = `-- LuaSpark Generated Script
-- Prompt: ${prompt}

print("Hello from LuaSpark!")
`;

  res.json({ output });
});

// ---------- PAYMENT CONFIRM ----------
app.post("/confirm-payment", (req, res) => {
  const { email } = req.body;
  const user = users.get(email);
  if (!user) return res.status(404).json({ error: "User not found." });
  user.hasPaid = true;
  res.json({ success: true });
});

// ---------- FRONTEND ROUTE ----------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Catch-all fallback (for SPA-style routes)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---------- START SERVER ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ LuaSpark server running at http://localhost:${PORT}`)
);
