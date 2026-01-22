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
    const response = await axios.get("https://api.duckduckgo.com/", {
  params: {
    q,
    format: "json",
    no_redirect: 1,
    no_html: 1
  }
});


    res.json(response.data);
  } catch (err) {
    console.error("Internet fetch failed:", err.message);
    res.status(500).json({ error: "Internet search failed" });
  }
});

export default router;
