import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Startup Key Health Check
console.log(`[FaceVerification] Gemini Key Active: ${process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 8) + '...' : 'MISSING'} | Model: gemini-2.0-flash`);

/**
 * Utility: Delay for rate-limit pacing
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Run async tasks in batches with a delay between each batch to avoid Gemini RPM limits.
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function to apply to each item
 * @param {number} batchSize - Number of concurrent requests per batch
 * @param {number} delayMs - Delay in ms between batches
 * @returns {Promise<Array>} Results
 */
export async function batchWithPacing(items, fn, batchSize = 3, delayMs = 300) {
    const results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
        if (i + batchSize < items.length) {
            await delay(delayMs); // Pace between batches
        }
    }
    return results;
}

/**
 * Compares a candidate image against an identity anchor image using Gemini 1.5 Flash.
 * @param {string} anchorUrl URL of the verified anchor image
 * @param {string} candidateUrl URL of the image to verify
 * @returns {Promise<number>} Similarity score (0-100)
 */
export async function verifyFaceSimilarity(anchorUrl, candidateUrl) {
    if (!process.env.GEMINI_API_KEY) {
        console.warn("[FaceVerification] Missing GEMINI_API_KEY. Skipping face similarity check.");
        return 100; // Fallback to accept all if no key
    }

    if (!anchorUrl || !candidateUrl) return 0;

    try {
        // Fetch images as base64
        const [anchorData, candidateData] = await Promise.all([
            fetchImageAsBase64(anchorUrl),
            fetchImageAsBase64(candidateUrl)
        ]);

        if (!anchorData || !candidateData) return 0;

        // Use gemini-2.0-flash which is provisioned for this project/key
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `
            Task: Compare the faces in these two images to determine if they are the same person.
            Image 1: The verified identity anchor.
            Image 2: A candidate image for the gallery.
            
            Are these the same person? 
            - Carefully analyze facial features, bone structure, and eye spacing.
            - Account for natural variations such as aging, lighting, facial hair, and expression changes.
            - If Image 2 is a group photo, you must verify that at least ONE person in the group is a match to the person in Image 1.
            - Be accurate but fair. If the faces are clearly different people, return false and a low confidence score (< 50).
            
            Return a JSON object:
            {
                "isSamePerson": boolean,
                "confidence": number (0-100),
                "reasoning": "Brief explanation"
            }
        `;

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: anchorData, mimeType: "image/jpeg" } },
            { inlineData: { data: candidateData, mimeType: "image/jpeg" } }
        ]);

        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\{.*\}/s);

        if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            console.log(`[FaceVerification] Similarity: ${data.confidence}% - ${candidateUrl}`);
            return data.isSamePerson ? data.confidence : 0;
        }

        console.warn("[FaceVerification] Could not parse AI response. Falling back to 'Probable'.");
        return 55; // Probable match if response is unreadable
    } catch (error) {
        if (error.message?.includes("429")) {
            const isRPM = error.message?.includes("rate") || error.message?.includes("RPM");
            console.warn(`[FaceVerification] ${isRPM ? 'Rate limit (RPM)' : 'Quota exceeded'} (429). Full error: ${error.message}. Skipping similarity check.`);
        } else {
            console.error("[FaceVerification] Similarity check error:", error.message);
        }
        // Fallback to high score for network/fetch/API failures to prevent accidental image disappearance
        return 55;
    }
}

/**
 * Detects if a given image contains a clear human face.
 * @param {string} imageUrl URL of the image to check
 * @returns {Promise<boolean>} True if a human face is detected, false otherwise.
 */
export async function detectHumanFace(imageUrl) {
    if (!process.env.GEMINI_API_KEY) {
        console.warn("[FaceVerification] Missing GEMINI_API_KEY. Assuming face exists fallback.");
        return true;
    }

    if (!imageUrl) return false;

    try {
        const imageData = await fetchImageAsBase64(imageUrl);
        if (!imageData) return false;

        // Use gemini-2.0-flash which is provisioned for this project/key
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `
            Task: Analyze this image and determine if it contains a clear, identifiable human face.
            Ignore company logos, cartoons, abstract art, text-heavy screenshots, or landscapes without clear faces.
            
            Return a simple JSON object:
            {
                "hasHumanFace": boolean,
                "confidence": number (0-100)
            }
        `;

        const result = await model.generateContent([
            prompt,
            { inlineData: { data: imageData, mimeType: "image/jpeg" } }
        ]);

        const responseText = result.response.text();
        const jsonMatch = responseText.match(/\{.*\}/s);

        if (jsonMatch) {
            const data = JSON.parse(jsonMatch[0]);
            if (!data.hasHumanFace) {
                console.log(`[FaceVerification] AI explicitly found no face in: ${imageUrl}`);
            }
            return data.hasHumanFace && data.confidence > 70;
        }

        console.warn("[FaceVerification] Could not parse face detection response. Falling back to true.");
        return true;
    } catch (error) {
        if (error.message?.includes("429")) {
            const isRPM = error.message?.includes("rate") || error.message?.includes("RPM");
            console.warn(`[FaceVerification] ${isRPM ? 'Rate limit (RPM)' : 'Quota exceeded'} (429). Full error: ${error.message}. Skipping detection gate.`);
        } else {
            console.error("[FaceVerification] Face detection error:", error.message);
        }
        // Fallback to true for network/quota errors to prevent blocking valid images
        return true;
    }
}

async function fetchImageAsBase64(url) {
    if (!url) return null;

    // Handle data URLs
    if (url.startsWith('data:')) {
        const parts = url.split(',');
        return parts.length > 1 ? parts[1] : null;
    }

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000, // Increased to 10s for slow CDNs
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Referer': 'https://www.google.com/'
            }
        });
        return Buffer.from(response.data, 'binary').toString('base64');
    } catch (err) {
        console.error(`[FaceVerification] Failed to fetch image: ${url.substring(0, 50)}... - ${err.message}`);
        return null;
    }
}
