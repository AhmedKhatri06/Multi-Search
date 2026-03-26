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
      console.error('[IG Service] Search Error:', error.message);
      return [];
    }
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
          'User-Agent': 'Instagram 10.1.0 Android (18/4.3; 320dpi; 720x1280; Xiaomi; HM 1SW; armani; en_US)',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
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

    // Basic logic: check if the first and last chars match the mask's visible chars
    // e.g. "dhruvil@gmail.com" matches "d***l@g***.com"
    const maskParts = cleanMask.split('@');
    const inputParts = cleanInput.split('@');

    if (maskParts.length === 2 && inputParts.length === 2) {
      const [maskLocal, maskDomain] = maskParts;
      const [inputLocal, inputDomain] = inputParts;

      if (maskLocal[0] !== inputLocal[0]) return false;
      if (maskLocal[maskLocal.length - 1] !== inputLocal[inputLocal.length - 1]) return false;
      
      // Domain check (usually masks show first char of domain)
      if (maskDomain[0] !== inputDomain[0]) return false;
      
      return true;
    }

    // Phone logic (mask usually shows last 2 digits)
    if (cleanMask.includes('*')) {
      const visibleSuffix = cleanMask.slice(-2);
      return cleanInput.endsWith(visibleSuffix);
    }

    return false;
  }

  /**
   * Full discovery flow for a name and optional contact info.
   */
  async identify(name, email, phone) {
    const sessionId = process.env.IG_SESSION_ID;
    if (!sessionId) {
      console.warn('[IG Service] No IG_SESSION_ID found in .env');
    }

    const handles = await this.searchHandles(name);
    const results = [];

    for (const handle of handles.slice(0, 5)) { // Limit to top 5 candidates for speed
      const info = await this.getMaskedInfo(handle, sessionId);
      
      let confidence = 0;
      let reason = 'Name match only';

      if (info) {
        const emailMatch = email && info.email_mask && this.isMaskMatch(email, info.email_mask);
        const phoneMatch = phone && info.phone_mask && this.isMaskMatch(phone, info.phone_mask);

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
