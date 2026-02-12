import mongoose from "mongoose";

const SearchHistorySchema = new mongoose.Schema({
    query: { type: String, required: true },
    name: { type: String, required: true },
    keywords: { type: [String], default: [] },
    location: { type: String, default: "" },
    number: { type: String, default: "" },
    results: {
        localCount: { type: Number, default: 0 },
        internetCount: { type: Number, default: 0 },
        socialCount: { type: Number, default: 0 }
    },
    timestamp: { type: Date, default: Date.now }
});

const SearchHistory = mongoose.model("SearchHistory", SearchHistorySchema);
export default SearchHistory;
