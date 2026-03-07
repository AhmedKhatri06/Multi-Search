import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            Task: Compare the faces in these two images.
            Image 1: The verified identity anchor.
            Image 2: A candidate image for the gallery.
            
            Are these the same person? 
            Consider facial features, bone structure, and eyes. Ignore age differences, lighting, or background.
            
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

        return 0;
    } catch (error) {
        console.error("[FaceVerification] Error:", error.message);
        return 0;
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
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        return Buffer.from(response.data, 'binary').toString('base64');
    } catch (err) {
        console.error(`[FaceVerification] Failed to fetch image: ${url.substring(0, 50)}... - ${err.message}`);
        return null;
    }
}
