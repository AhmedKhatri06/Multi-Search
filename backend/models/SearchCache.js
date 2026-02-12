import mongoose from "mongoose";

const SearchCacheSchema = new mongoose.Schema({
    query: { type: String, required: true, unique: true },
    type: { type: String, default: "SEARCH" },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    timestamp: { type: Date, default: Date.now, expires: 3600 * 24 * 7 } // 7 days TTL
});

const SearchCache = mongoose.model("SearchCache", SearchCacheSchema);
export default SearchCache;
