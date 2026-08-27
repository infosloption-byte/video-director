import cors from "cors";
import express from "express";
import signalsRouter from "./routes/signals.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/signals", signalsRouter);

// Fallback 404 for unmatched /api routes.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found." });
});

export default app;
