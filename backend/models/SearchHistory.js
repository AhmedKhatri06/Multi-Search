import mongoose from 'mongoose';

const searchHistorySchema = new mongoose.Schema({
    query: {
        type: String,
        required: true
    },
    name: String,
    keywords: [String],
    location: String,
    number: String,
    timestamp: {
        type: Date,
        default: Date.now
    },
    results: {
        type: Object,
        default: {}
    }
});

export default mongoose.model('SearchHistory', searchHistorySchema);
