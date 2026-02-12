import mongoose from "mongoose";

const FormInfoSchema = new mongoose.Schema({
    name: { type: String, required: true },
    keyword: { type: String, required: true },
    location: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now }
});

const FormInfo = mongoose.model("FormInfo", FormInfoSchema);
export default FormInfo;

