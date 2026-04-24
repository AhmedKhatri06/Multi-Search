/**
 * localSummary.js — Local AI summary generation using Ollama.
 * 
 * Provides generateText and generateJSON using a local Ollama instance.
 * Falls back gracefully if Ollama is unavailable.
 */

import dotenv from 'dotenv';

dotenv.config();

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

// Check if Ollama should be used (can be disabled via env)
const OLLAMA_ENABLED = process.env.OLLAMA_ENABLED !== 'false';

let ollamaAvailable = null; // null = unchecked, true/false after check
let lastCheckTime = 0;

/**
 * Test if Ollama is reachable.
 * @returns {Promise<boolean>}
 */
async function checkOllamaHealth() {
    // MODULE 2: Fast-check cache (prevent repetitive hangs)
    const now = Date.now();
    if (ollamaAvailable === false && (now - lastCheckTime) < 30000) {
        return false; // Skip checking for 30s if it's confirmed down
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000); // Increased to 2s

        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (response.ok) {
            const data = await response.json();
            const models = data.models || [];
            const hasModel = models.some(m => m.name.includes(OLLAMA_MODEL));
            if (hasModel) {
                console.log(`[LocalSummary] Ollama available with model: ${OLLAMA_MODEL}`);
                return true;
            } else {
                console.warn(`[LocalSummary] Ollama running but model '${OLLAMA_MODEL}' not found. Available: ${models.map(m => m.name).join(', ')}`);
                // Try to use whatever model is available
                if (models.length > 0) {
                    console.log(`[LocalSummary] Will use first available model: ${models[0].name}`);
                    return true;
                }
                return false;
            }
        }
        return false;
    } catch (e) {
        console.warn(`[LocalSummary] Ollama not reachable at ${OLLAMA_BASE_URL}: ${e.message}`);
        ollamaAvailable = false;
        lastCheckTime = Date.now();
        return false;
    }
}

/**
 * Generate text using local Ollama instance.
 * @param {string} prompt - The user prompt
 * @param {string} [systemPrompt] - Optional system prompt
 * @param {Object} [options] - Additional options
 * @param {number} [options.temperature=0.5] - Temperature
 * @param {number} [options.timeoutMs=30000] - Timeout in ms
 * @returns {Promise<string|null>} Generated text, or null if Ollama is unavailable
 */
export async function ollamaGenerateText(prompt, systemPrompt = '', options = {}) {
    if (!OLLAMA_ENABLED) return null;

    // Lazy health check
    if (ollamaAvailable === null) {
        ollamaAvailable = await checkOllamaHealth();
    }

    if (!ollamaAvailable) return null;

    options = { timeoutMs: 60000, ...options }; // Default to 60s
    const { temperature = 0.5 } = options;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

        const messages = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages,
                stream: false,
                options: {
                    temperature,
                    num_predict: 512 // Keep responses concise
                }
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            console.warn(`[LocalSummary] Ollama returned ${response.status}`);
            return null;
        }

        const data = await response.json();
        const text = data.message?.content || '';

        if (text.trim()) {
            console.log(`[LocalSummary] Generated ${text.length} chars via Ollama (${OLLAMA_MODEL})`);
            return text.trim();
        }

        return null;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn(`[LocalSummary] Ollama request timed out after ${options.timeoutMs}ms`);
        } else {
            console.error(`[LocalSummary] Ollama error: ${error.message}`);
        }
        // Mark as unavailable to avoid retrying every call
        ollamaAvailable = false;
        return null;
    }
}

/**
 * Generate structured JSON using local Ollama instance.
 * @param {string} prompt - The user prompt
 * @param {string} [systemPrompt] - Optional system prompt
 * @returns {Promise<Object|null>} Parsed JSON, or null if unavailable
 */
export async function ollamaGenerateJSON(prompt, systemPrompt = '') {
    const text = await ollamaGenerateText(prompt, systemPrompt, { temperature: 0.3 });
    if (!text) return null;

    try {
        // Clean markdown code blocks
        let cleaned = text.trim();
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/```(json)?/g, '').replace(/```/g, '').trim();
        }

        // Try to extract JSON
        const jsonMatch = cleaned.match(/[\[{].*[\]}]/s);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        return JSON.parse(cleaned);
    } catch (e) {
        console.warn(`[LocalSummary] Failed to parse Ollama JSON output: ${text.substring(0, 100)}...`);
        return null;
    }
}

/**
 * Reset the Ollama availability check (useful after Ollama is started/restarted).
 */
export function resetOllamaCheck() {
    ollamaAvailable = null;
}

/**
 * Check if Ollama is currently available.
 * @returns {boolean|null}
 */
export function isOllamaAvailable() {
    return ollamaAvailable;
}
