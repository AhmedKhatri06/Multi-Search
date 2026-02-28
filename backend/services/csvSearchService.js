import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { normalizePhoneNumber, unifiedMapper } from '../utils/searchHelper.js';

const SCRIPTS_DIR = path.resolve('scripts'); // Context: backend directory

/**
 * Searches across all CSV files in the scripts folder.
 * @param {string} query The search term
 * @param {"PHONE" | "NAME"} type The type of search
 * @returns {Promise<any[]>} Aggregated results
 */
export async function searchCSVs(query, type) {
    const results = [];

    // Ensure scripts directory exists
    if (!fs.existsSync(SCRIPTS_DIR)) {
        console.warn(`[CSV Search] Scripts directory not found at ${SCRIPTS_DIR}`);
        return [];
    }

    const files = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.csv'));
    const normalizedQuery = type === "PHONE" ? normalizePhoneNumber(query) : query.toLowerCase().trim();

    for (const file of files) {
        const filePath = path.join(SCRIPTS_DIR, file);
        const fileResults = await searchSingleCSV(filePath, query, type);
        results.push(...fileResults.map(r => unifiedMapper(r, `CSV:${file}`)));
    }

    return results;
}

/**
 * Searches a single CSV file using streams for memory efficiency.
 * @param {string} filePath 
 * @param {string} query 
 * @param {"PHONE" | "NAME"} type 
 */
async function searchSingleCSV(filePath, query, type) {
    const stream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
    });

    let headers = [];
    const results = [];
    let isFirstLine = true;

    const normalizedQuery = type === "PHONE" ? normalizePhoneNumber(query) : query.toLowerCase().trim();

    for await (const line of rl) {
        const columns = parseCSVLine(line);

        if (isFirstLine) {
            // Remove BOM and clean whitespace
            headers = columns.map(h => h.replace(/^\uFEFF/, '').trim());
            isFirstLine = false;
            continue;
        }

        const row = {};
        headers.forEach((header, index) => {
            row[header] = columns[index] || "";
        });

        if (type === "PHONE") {
            const phoneVal = row.Number || row.phone || row.mobile || row.contact || "";
            const rowPhone = normalizePhoneNumber(phoneVal);
            if (rowPhone && rowPhone.includes(normalizedQuery)) {
                results.push(row);
                if (results.length >= 5) break;
            }
        } else {
            const nameVal = row.Name || row.name || row.full_name || "";
            const rowName = nameVal.toLowerCase().trim();
            if (rowName && (rowName === normalizedQuery || rowName.includes(normalizedQuery))) {
                results.push(row);
                if (results.length >= 5) break;
            }
        }
    }

    rl.close();
    stream.destroy();
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
