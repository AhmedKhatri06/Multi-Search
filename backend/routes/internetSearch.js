import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

router.get("/", async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: "Query required" });
  }

  try {
    const response = await axios.get(
      `${process.env.BACKEND_URL}/api/search/internet?q=${encodeURIComponent(q)}`
    );

    res.json(response.data);
  } catch (err) {
    console.error("Internet fetch failed:", err.message);
    res.status(500).json({ error: "Internet search failed" });
  }
});

export default router;
