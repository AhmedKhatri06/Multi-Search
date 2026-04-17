import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const IG_SIG_KEY = 'e6358aeede6761b49fef702b30f44d35e39d2181a34cede805e39d2181a34cede';
const IG_SIG_KEY_VERSION = '4';

/**
 * Service to handle Instagram discovery and technical proofing (mask matching).
 * Replicates the logic of 'yesitsme' for product-level integration.
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class InstagramService {
  /**
   * Generates a signed body for Instagram internal API requests.
   */
  generateSignature(data) {
    const jsonStr = JSON.stringify(data);
    const hash = crypto
      .createHmac('sha256', IG_SIG_KEY)
      .update(jsonStr)
      .digest('hex');
    return `ig_sig_key_version=${IG_SIG_KEY_VERSION}&signed_body=${hash}.${jsonStr}`;
  }

  /**
   * Scrapes an Instagram indexer (Dumpor) to find handles matching a name.
   */
  async searchHandles(name) {
    try {
      const url = `https://dumpor.com/search?query=${encodeURIComponent(name)}`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const handles = [];
      $('.profile-name-link').each((i, el) => {
        const handle = $(el).text().trim().replace('@', '');
        if (handle) handles.push(handle);
      });

      return [...new Set(handles)]; // Unique handles
    } catch (error) {
      console.warn('[IG Service] Primary indexer failed:', error.message);
      
      // Fallback: Use Serper to find handles directly from Google
      try {
        if (!process.env.SERPER_API_KEY) return [];
        console.log(`[IG Service] Falling back to Serper for ${name} handle discovery...`);
        const response = await axios.post("https://google.serper.dev/search", {
          q: `site:instagram.com "${name}"`,
          num: 10
        }, {
          headers: { 
            "X-API-KEY": process.env.SERPER_API_KEY, 
            "Content-Type": "application/json" 
          },
          timeout: 5000
        });
        
        const handles = (response.data.organic || [])
          .map(r => r.link || r.url || "")
          .filter(l => l.includes('instagram.com/'))
          .map(l => l.split('instagram.com/')[1].split('/')[0])
          .filter(h => h && !['p', 'reels', 'stories', 'explore', 'tags'].includes(h));
          
        return [...new Set(handles)];
      } catch (fallbackError) {
        console.error('[IG Service] Serper fallback failed:', fallbackError.message);
        return [];
      }
    }
  }

  /**
   * Generates likely Instagram handle patterns from a person's name.
   */
  generatePredictiveHandles(name) {
    if (!name) return [];
    const parts = name.toLowerCase().split(/\s+/).filter(p => p.length > 1);
    const first = parts[0];
    const last = parts[parts.length - 1];
    
    if (!first) return [];
    
    // Single-word name guard: only generate meaningful patterns
    if (!last || first === last) {
      return [
        `${first}`,
        `${first}_official`,
        `${first}.real`
      ];
    }
    
    return [
      `${first}.${last}`,
      `${first}_${last}`,
      `${first}${last}`,
      `${first[0]}${last}`,
      `${first}${last[0]}`
    ];
  }

  /**
   * Fetches the obfuscated (masked) contact info for a handle using a session ID.
   */
  async getMaskedInfo(handle, sessionId) {
    if (!sessionId) return null;

    try {
      const url = 'https://i.instagram.com/api/v1/users/lookup/';
      const data = {
        q: handle,
        timezone_offset: '19800',
        _csrftoken: 'missing',
        device_id: `android-${crypto.randomBytes(8).toString('hex')}`
      };

      const signedBody = this.generateSignature(data);

      const response = await axios.post(url, signedBody, {
        headers: {
          'Cookie': `sessionid=${sessionId}`,
          'User-Agent': 'Instagram 260.0.0.22.115 Android (31/12; 480dpi; 1080x2280; OnePlus; GM1913; OnePlus7Pro; qcom; en_US; 341643444)',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-IG-App-ID': '936619743392459', // Modern App ID
          'X-IG-Capabilities': '3brTvx0=',
          'X-IG-Connection-Type': 'WIFI',
          'Accept-Language': 'en-US'
        }
      });

      return {
        email_mask: response.data.obfuscated_email || null,
        phone_mask: response.data.obfuscated_phone || null,
        user_id: response.data.user?.pk || null
      };
    } catch (error) {
      console.error('[IG Service] Lookup Error:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Compares a plain text input with a masked string.
   */
  isMaskMatch(input, mask) {
    if (!input || !mask) return false;
    
    const cleanInput = input.toLowerCase().trim();
    const cleanMask = mask.toLowerCase().trim();

    // Email mask matching with multi-character verification
    // e.g. "dhruvil@gmail.com" matches "d*****l@g****.com"
    const maskParts = cleanMask.split('@');
    const inputParts = cleanInput.split('@');

    if (maskParts.length === 2 && inputParts.length === 2) {
      const [maskLocal, maskDomain] = maskParts;
      const [inputLocal, inputDomain] = inputParts;

      // 1. First and last character of local part must match
      if (maskLocal[0] !== inputLocal[0]) return false;
      if (maskLocal[maskLocal.length - 1] !== inputLocal[inputLocal.length - 1]) return false;
      
      // 2. Length verification: the mask's total length (visible + asterisks) 
      //    should approximate the input length. This prevents short inputs
      //    from matching long masks and vice versa.
      const maskLocalLength = maskLocal.length;
      if (Math.abs(maskLocalLength - inputLocal.length) > 2) return false;
      
      // 3. Domain suffix must match (e.g., ".com" must equal ".com")
      const maskDomainSuffix = maskDomain.replace(/^[^.]*/, ''); // ".com" from "g***.com"
      const inputDomainSuffix = inputDomain.replace(/^[^.]*/, '');
      if (maskDomainSuffix !== inputDomainSuffix) return false;
      
      // 4. Domain first character must match
      if (maskDomain[0] !== inputDomain[0]) return false;
      
      return true;
    }

    // Phone mask matching with multi-digit suffix verification
    if (cleanMask.includes('*')) {
      // Extract all visible (non-asterisk) trailing digits from mask
      const visibleTrailing = cleanMask.match(/[0-9]+$/)?.[0] || '';
      const cleanPhone = cleanInput.replace(/\D/g, '');
      
      if (visibleTrailing.length < 2) return false; // Need at least 2 visible digits
      return cleanPhone.endsWith(visibleTrailing);
    }

    return false;
  }

  /**
   * Full discovery flow for a name and optional contact info (emails/phones).
   */
  async identify(name, emails = [], phones = []) {
    const sessionIds = (process.env.IG_SESSION_IDS || process.env.IG_SESSION_ID || "").split(/[\s,]+/).filter(id => id.length > 5);
    
    if (sessionIds.length === 0) {
      console.warn('[IG Service] No IG_SESSION_IDS found in .env. Discovery will be limited.');
    }

    // Ensure inputs are arrays
    const emailList = Array.isArray(emails) ? emails : (emails ? [emails] : []);
    const phoneList = Array.isArray(phones) ? phones : (phones ? [phones] : []);

    let handles = await this.searchHandles(name);
    
    // Predictive Probing: Add likely patterns if results are thin
    if (handles.length < 5) {
      const alternatives = this.generatePredictiveHandles(name);
      const beforeCount = handles.length;
      handles = [...new Set([...handles, ...alternatives])];
      console.log(`[IG Service] Pattern Probing: Added ${handles.length - beforeCount} new handles (${alternatives.length} patterns generated).`);
    }

    const results = [];

    for (const handle of handles.slice(0, 5)) { // Limit to top 5 candidates for speed
      // PERMANENT STABILITY FIX: Session Rotation
      const currentSession = sessionIds[Math.floor(Math.random() * sessionIds.length)];
      
      const info = await this.getMaskedInfo(handle, currentSession);
      await sleep(500); // Pacing to avoid blocks
      
      let confidence = 0;
      let reason = 'Name match only';

      if (info) {
        const emailMatch = emailList.some(email => info.email_mask && this.isMaskMatch(email, info.email_mask));
        const phoneMatch = phoneList.some(phone => info.phone_mask && this.isMaskMatch(phone, info.phone_mask));

        if (emailMatch || phoneMatch) {
          confidence = 90;
          reason = `Technical match (Mask: ${info.email_mask || info.phone_mask})`;
        } else if (info.email_mask || info.phone_mask) {
          // It has a mask but it doesn't match our input
          confidence = 10;
          reason = 'Mismatched contact info';
        }
      }

      results.push({
        handle,
        confidence,
        reason,
        url: `https://instagram.com/${handle}`,
        masked_info: info
      });
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }
}

export default new InstagramService();
