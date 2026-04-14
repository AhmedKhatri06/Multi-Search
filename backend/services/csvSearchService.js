import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { normalizePhoneNumber, unifiedMapper } from '../utils/searchHelper.js';

const SCRIPTS_DIR = path.resolve('scripts'); // Context: backend directory

let csvCache = [];
let isInitialized = false;

export async function initCSVService() {
    if (isInitialized) return;

    if (!fs.existsSync(SCRIPTS_DIR)) {
        console.warn(`[CSV Search] Scripts directory not found at ${SCRIPTS_DIR}`);
        return;
    }

    const MAX_FILE_SIZE_MB = 50;
    const files = fs.readdirSync(SCRIPTS_DIR).filter(file => {
        if (!file.endsWith('.csv')) return false;
        const stats = fs.statSync(path.join(SCRIPTS_DIR, file));
        const fileSizeMB = stats.size / (1024 * 1024);
        if (fileSizeMB > MAX_FILE_SIZE_MB) {
            console.warn(`[CSV Search] Skipping ${file} (${fileSizeMB.toFixed(2)}MB) - exceeds limit.`);
            return false;
        }
        return true;
    });

    console.log(`[CSV Search] Initializing in-memory cache for ${files.length} valid CSV files...`);

    for (const file of files) {
        const filePath = path.join(SCRIPTS_DIR, file);
        const countBefore = csvCache.length;
        await loadCSVIntoMemory(filePath, file);
        console.log(`[CSV Search] Indexed ${file}: +${csvCache.length - countBefore} records.`);
    }

    isInitialized = true;
    console.log(`[CSV Search] Cache initialized with ${csvCache.length} records.`);
}

async function loadCSVIntoMemory(filePath, fileName) {
    const stream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
    });

    let headers = [];
    let isFirstLine = true;

    for await (const line of rl) {
        const columns = parseCSVLine(line);

        if (isFirstLine) {
            headers = columns.map(h => h.replace(/^\uFEFF/, '').trim());
            isFirstLine = false;
            continue;
        }

        const row = {};
        let hasData = false;
        headers.forEach((header, index) => {
            if (columns[index]) {
                row[header] = columns[index];
                hasData = true;
            } else {
                row[header] = "";
            }
        });

        if (hasData) {
            csvCache.push({ file: fileName, data: row });
        }
    }

    rl.close();
    stream.destroy();
}

/**
 * Searches across all cached CSV records in memory.
 * @param {string} query The search term
 * @param {"PHONE" | "NAME"} type The type of search
 * @returns {Promise<any[]>} Aggregated results
 */
export async function searchCSVs(query, type) {
    if (!isInitialized) {
        await initCSVService();
    }

    const results = [];
    const normalizedQuery = type === "PHONE" ? normalizePhoneNumber(query) : query.toLowerCase().trim();

    const fileHitCount = {};

    for (const record of csvCache) {
        const { file, data } = record;
        fileHitCount[file] = fileHitCount[file] || 0;

        if (fileHitCount[file] >= 5) continue;

        if (type === "PHONE") {
            const phoneVal = data.Number || data.phone || data.mobile || data.contact || "";
            const rowPhone = normalizePhoneNumber(phoneVal);
            if (rowPhone && rowPhone.includes(normalizedQuery)) {
                results.push(unifiedMapper(data, `CSV:${file}`));
                fileHitCount[file]++;
            }
        } else {
            const nameVal = data.Name || data.name || data.full_name || "";
            const rowName = nameVal.toLowerCase().trim();
            if (rowName && (rowName === normalizedQuery || rowName.includes(normalizedQuery))) {
                results.push(unifiedMapper(data, `CSV:${file}`));
                fileHitCount[file]++;
            }
        }
    }

    return results;
}

/**
 * Simple CSV line parser that handles quotes.
 * @param {string} line 
 */
function parseCSVLine(line) {
    const result = [];
    let curValue = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
            result.push(curValue.trim());
            curValue = "";
        } else {
            curValue += char;
        }
    }
    result.push(curValue.trim());
    return result.map(v => v.replace(/^"|"$/g, ''));
}
