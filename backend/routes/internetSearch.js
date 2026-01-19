/*
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

    const ddgRawTopics = ddgResponse.data.RelatedTopics || [];
const normalizedDDGResults = [];

function extractDDG(items) {
  for (const item of items) {
    // Valid result
    if (item.Text && item.FirstURL) {
      normalizedDDGResults.push({
        title: item.Text,
        url: item.FirstURL,
        source: "DuckDuckGo"
      });
    }

    // Nested category
    if (item.Topics) {
      extractDDG(item.Topics);
    }
  }
}

extractDDG(ddgRawTopics);

const duckDuckGoData = {
  source: "DuckDuckGo",
  abstract: ddgResponse.data.AbstractText || "",
  results: normalizedDDGResults.slice(0, 5)
};


    // 2️⃣ Wikipedia Search (Robust & Production Safe)
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
      headers: {
        "User-Agent": "MultiSearchApp/1.0 (contact@example.com)"
      }
    }
  );

  const searchResults = searchResponse.data?.query?.search;

  if (searchResults && searchResults.length > 0) {
    const pageTitle = searchResults[0].title;

    // Step 2: Get page summary
    const pageResponse = await axios.get(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`,
      {
        headers: {
          "User-Agent": "MultiSearchApp/1.0 (contact@example.com)"
        }
      }
    );

    wikipediaData = {
      source: "Wikipedia",
      title: pageResponse.data.title,
      description: pageResponse.data.extract,
      pageUrl: pageResponse.data.content_urls?.desktop?.page
    };
  }
} catch (error) {
  console.error("Wikipedia error:", error.message);
  wikipediaData = null;
}
// 3️⃣ Fallback: Use DuckDuckGo if Wikipedia is null
if (!wikipediaData) {
  wikipediaData = {
    source: "Wikipedia (fallback)",
    title: query,
    description:
      duckDuckGoData.abstract ||
      "No detailed Wikipedia page found for this query.",
    pageUrl: null
  };
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
*/
//Updated code with Validaition of results
import express from "express";
import axios from "axios";

const router = express.Router();

router.get("/", async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  const normalizedQuery = query.toLowerCase();

  try {
    /* ================================
       1️⃣ DuckDuckGo Search (Filtered)
    ================================= */
    const ddgResponse = await axios.get("https://api.duckduckgo.com/", {
      params: {
        q: query,
        format: "json",
        no_redirect: 1,
        no_html: 1
      },
      timeout: 5000
    });

    const ddgRawTopics = ddgResponse.data.RelatedTopics || [];
    const normalizedDDGResults = [];

    function extractDDG(items) {
      for (const item of items) {
        // Valid result
        if (!item.Text || !item.FirstURL) continue;

        const text = item.Text.toLowerCase();
        const firstName = normalizedQuery.split(" ")[0];

        if (
          text.includes(normalizedQuery) ||
          text.includes(firstName)
        ) {
          normalizedDDGResults.push({
            title: item.Text,
            url: item.FirstURL,
            source: "DuckDuckGo"
          });
        }


        // Nested categories
        if (item.Topics) {
          extractDDG(item.Topics);
        }
      }
    }

    extractDDG(ddgRawTopics);

    const duckDuckGoData = {
      source: "DuckDuckGo",
      results: normalizedDDGResults.slice(0, 5)
    };

    // Wikipedia Search 
    let wikipediaData = null;

    try {
      // Step 1: Wikipedia search
      const searchResponse = await axios.get(
        "https://en.wikipedia.org/w/api.php",
        {
          params: {
            action: "query",
            list: "search",
            srsearch: query,
            format: "json"
          },
          headers: {
            "User-Agent": "MultiSearchApp/1.0"
          },
          timeout: 5000
        }
      );

      const searchResults = searchResponse.data?.query?.search;

      if (searchResults && searchResults.length > 0) {
        const pageTitle = searchResults[0].title;

        // Step 2: Page summary
        const pageResponse = await axios.get(
          `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
            pageTitle
          )}`,
          {
            headers: {
              "User-Agent": "MultiSearchApp/1.0"
            },
            timeout: 5000
          }
        );

        const title = pageResponse.data.title?.toLowerCase() || "";
        const extract = pageResponse.data.extract?.toLowerCase() || "";

        // ✅ STRICT VALIDATION
        if (
          title.includes(normalizedQuery) ||
          extract.includes(normalizedQuery)
        ) {
          wikipediaData = {
            source: "Wikipedia",
            title: pageResponse.data.title,
            description: pageResponse.data.extract,
            pageUrl: pageResponse.data.content_urls?.desktop?.page
          };
        }
      }
    } catch (err) {
      console.error("Wikipedia fetch failed:", err.message);
      wikipediaData = null;
    }

//       FINAL RESPONSE
    return res.json({
      query,
      duckDuckGo: duckDuckGoData,
      wikipedia: wikipediaData
    });

  } catch (error) {
    console.error("Internet search failed:", error.message);
    return res.status(500).json({ error: "Internet search failed" });
  }
});
console.log("DDG results count:", normalizedDDGResults.length);

export default router;
