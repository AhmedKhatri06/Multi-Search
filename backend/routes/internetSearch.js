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
    // 🔹 DuckDuckGo Instant Answer API (NO images)
    const ddgResponse = await axios.get("https://api.duckduckgo.com/", {
      params: {
        q,
        format: "json",
        no_redirect: 1,
        no_html: 1
      }
    });

    const data = ddgResponse.data;

    const results = {
      wikipedia: data.AbstractText
        ? {
            title: data.Heading,
            description: data.AbstractText,
            pageUrl: data.AbstractURL
          }
        : null,

      duckDuckGo: {
        results: (data.RelatedTopics || [])
          .filter(item => item.Text && item.FirstURL)
          .map(item => ({
            title: item.Text,
            url: item.FirstURL
          }))
      }
    };

    res.json(results);

  } catch (err) {
    console.error("Internet search failed:", err.message);
    res.status(500).json({ error: "Internet search failed" });
  }
});

export default router;
