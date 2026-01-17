import express from "express";
import axios from "axios";

const router = express.Router();


router.get("/", async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  try {
    // 1️⃣ DuckDuckGo Search
    const ddgResponse = await axios.get(
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

    const duckDuckGoData = {
      source: "DuckDuckGo",
      abstract: ddgResponse.data.AbstractText || "",
      relatedTopics: (ddgResponse.data.RelatedTopics || []).slice(0, 5)
    };

   // 2️⃣ Wikipedia Search (Search → Summary approach)
let wikipediaData = null;

try {
  // Step 1: Search Wikipedia
  const searchResponse = await axios.get(
    "https://en.wikipedia.org/w/api.php",
    {
      params: {
        action: "query",
        list: "search",
        srsearch: query,
        format: "json",
      },
    }
  );

  const searchResults = searchResponse.data?.query?.search;

  if (searchResults && searchResults.length > 0) {
    const pageTitle = searchResults[0].title;

    // Step 2: Get page summary
    const pageResponse = await axios.get(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
    );

    wikipediaData = {
      source: "Wikipedia",
      title: pageResponse.data.title,
      description: pageResponse.data.extract,
      pageUrl: pageResponse.data.content_urls?.desktop?.page
    };
  }
} catch (error) {
  console.error("Wikipedia search failed:", error.message);
  wikipediaData = null;
}


    // Final response
    res.json({
      query,
      duckDuckGo: duckDuckGoData,
      wikipedia: wikipediaData
    });

  } catch (error) {
    console.error("Internet search failed:", error.message);
    res.status(500).json({ error: "Internet search failed" });
  }
});

export default router;
