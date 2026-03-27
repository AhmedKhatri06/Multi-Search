import mongoose from 'mongoose';

const EnrichCacheSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true }, // name:company:domain
    data: { 
        email: String,
        phone: String,
        source: String,
        confidence: Number,
        verificationStatus: String,
        raw: mongoose.Schema.Types.Mixed
    },
    timestamp: { type: Date, default: Date.now, expires: 3600 * 24 * 3 } // 3 days TTL
});

const EnrichCache = mongoose.model('EnrichCache', EnrichCacheSchema);
export default EnrichCache;
