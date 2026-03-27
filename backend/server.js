import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import lookUpRoute from "./routes/multiSearch.js";
import internetSearch from "./routes/internetSearch.js";
import nexaSearchRoute from "./routes/nexaSearch.js";
import proxyRoute from "./routes/proxy.js";
import previewRoute from "./routes/preview.js";
import authRoute from "./routes/auth.js";
import enrichRoute from "./routes/enrich.js";
import { initCSVService } from "./services/csvSearchService.js";
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Error:", err));

// Start initialization of in-memory caching
initCSVService().catch(err => console.error("CSV Init Error:", err));

app.use("/api/lookup", lookUpRoute);
app.use("/api/multi-search", lookUpRoute); // Backward compatibility
app.use("/api/nexa-search", nexaSearchRoute);
app.use("/api/proxy", proxyRoute);
app.use("/api/preview", previewRoute);
app.use("/api/auth", authRoute);
app.use("/api/enrich", enrichRoute);
app.use("/images", express.static(path.join(process.cwd(), "images")));
app.use("/api/search/internet", internetSearch);
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
