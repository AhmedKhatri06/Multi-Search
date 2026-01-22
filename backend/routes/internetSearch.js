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
    "https://api.search.brave.com/res/v1/web/search",
    {
      params: { q: query },
      headers: {
        "X-Subscription-Token": process.env.BRAVE_API_KEY,
        "Accept": "application/json"
      },
      timeout: 8000
    }
  );

  return response.data;
} catch (err) {
  console.error("Internet fetch failed:", err.message);
  return [];
}

});

export default router;
