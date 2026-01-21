import express from "express";
import axios from "axios";

const router = express.Router();

router.post("/", async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    const response = await axios.get(
      "https://api.duckduckgo.com/",
      {
        params: {
          q: query,
          format: "json",
          no_redirect: 1,
          no_html: 1
        }
      }
    );

    const data = response.data;

    const results = [];

    // Wikipedia-style result
    if (data.AbstractText) {
      results.push({
        title: data.Heading,
        description: data.AbstractText,
        url: data.AbstractURL,
        source: "Wikipedia"
      });
    }

    // Related topics
    if (data.RelatedTopics) {
      data.RelatedTopics.forEach(item => {
        if (item.Text && item.FirstURL) {
          results.push({
            title: item.Text,
            url: item.FirstURL,
            source: "DuckDuckGo"
          });
        }
      });
    }

    return res.json({
      query,
      results
    });

  } catch (error) {
    console.error("Global Internet Search failed:", error.message);
    return res.json({
      query,
      results: []
    });
  }
});

export default router;
