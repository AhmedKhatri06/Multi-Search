import mongoose from "mongoose";

const searchCacheSchema = new mongoose.Schema({
    query: { type: String, required: true, index: true },
    type: { type: String, required: true, enum: ["IDENTIFY", "SEARCH"] }, // To distinguish between identify and full search
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: 86400 } // Auto-delete after 24 hours (86400 seconds)
});

// Composite index to ensure unique cache per query + type
searchCacheSchema.index({ query: 1, type: 1 }, { unique: true });

export default mongoose.model("SearchCache", searchCacheSchema);
