import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema({
  text: String,
  source: String,
  metadata: Object
});

export default mongoose.model("Document", DocumentSchema);
