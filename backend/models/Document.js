import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema({
    text: { type: String, required: true },
    source: { type: String, default: "Internal" },
    priority: { type: Number, default: 1 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now }
});

const Document = mongoose.model("Document", DocumentSchema);
export default Document;
