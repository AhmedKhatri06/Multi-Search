import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import multiSearchRoute from "./routes/multiSearch.js";
import internetSearch from "./routes/internetSearch.js";
import nexaSearchRoute from "./routes/nexaSearch.js";
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Error:", err));

app.use("/api/multi-search", multiSearchRoute);
app.use("/api/nexa-search", nexaSearchRoute);
app.use("/images", express.static(path.join(process.cwd(), "images")));
app.use("/api/search/internet", internetSearch);
app.get("/", (req, res) => {
  res.send("Backend is running 🚀");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
