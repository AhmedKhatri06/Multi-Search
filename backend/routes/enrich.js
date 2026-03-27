import express from 'express';
import { enrichContact } from '../services/enrichmentService.js';

const router = express.Router();

/**
 * POST /api/enrich
 * Input: { name, company, domain }
 */
router.post('/', async (req, res) => {
    const { name, company, domain } = req.body;

    if (!name || !domain) {
        return res.status(400).json({ error: 'Name and Domain are required for enrichment' });
    }

    console.log(`[Enrich Request] ${name} | ${company} | ${domain}`);

    try {
        const result = await enrichContact(name, company || '', domain);
        res.json(result);
    } catch (err) {
        console.error('[Enrich Route] Error:', err.message);
        res.status(500).json({ error: 'Internal enrichment failure', message: err.message });
    }
});

export default router;
