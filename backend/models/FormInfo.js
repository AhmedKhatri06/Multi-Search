import mongoose from "mongoose";

const formInfoSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    Keyword: {
        type: String,
        required: true
    },
    Location: {
        type: String,
        default: "none"
    }
}, {
    timestamps: true,
    collection: "forminfo" // Ensure it uses the exact name requested
});

export default mongoose.model("FormInfo", formInfoSchema);
