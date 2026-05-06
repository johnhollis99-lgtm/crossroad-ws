/**
 * RoadStory — /api/contributions
 *
 * Endpoints:
 *   POST /api/contributions/submit  — validate, anti-spam, then call submit_contribution RPC
 *   GET  /api/contributions/stats/:userId — call get_user_contribution_stats RPC
 *   POST /api/contributions/redeem  — call redeem_reward RPC
 *
 * Anti-spam rules (enforced server-side before the RPC):
 *   1. Max 20 contributions per user per UTC day
 *   2. No duplicate poi_verification for the same POI within 24 hours
 */

const express      = require('express');
const router       = express.Router();
const { supabase } = require('../lib/supabase');

// ── Constants ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_TYPES = new Set([
  'poi_verification',
  'poi_correction',
  'poi_addition',
  'narration_rating',
  'photo_upload',
  'trail_addition',
]);

const VALID_REWARDS = new Set([
  'free_month',
  'discount_month',
  'premium_narrator_unlock',
  'early_access',
]);

// Point values mirrored here for the response (source of truth is the RPC)
const POINTS_BY_TYPE = {
  poi_verification: 5,
  poi_correction:   10,
  poi_addition:     25,
  narration_rating: 2,
  photo_upload:     10,
  trail_addition:   30,
};

const MAX_DAILY        = 20;
const DEDUP_WINDOW_MS  = 24 * 60 * 60 * 1000; // 24 hours in ms

// ── Input validation middleware ───────────────────────────────────────────────

function validateSubmit(req, res, next) {
  const { user_id, contribution_type, poi_id, details } = req.body ?? {};
  const errors = [];

  if (!user_id || !UUID_RE.test(user_id))
    errors.push('user_id must be a valid UUID');
  if (!VALID_TYPES.has(contribution_type))
    errors.push(`contribution_type must be one of: ${[...VALID_TYPES].join(', ')}`);
  if (poi_id !== undefined && poi_id !== null && !UUID_RE.test(poi_id))
    errors.push('poi_id must be a valid UUID when provided');
  if (details !== undefined && (typeof details !== 'object' || Array.isArray(details)))
    errors.push('details must be a JSON object when provided');

  // Type-specific required detail fields
  if (contribution_type === 'poi_correction' && !details?.correction_text)
    errors.push('details.correction_text is required for poi_correction');
  if (contribution_type === 'photo_upload' && !details?.photo_url)
    errors.push('details.photo_url is required for photo_upload');
  if (contribution_type === 'poi_addition') {
    if (!details?.name)     errors.push('details.name is required for poi_addition');
    if (!details?.lat)      errors.push('details.lat is required for poi_addition');
    if (!details?.lng)      errors.push('details.lng is required for poi_addition');
    if (!details?.category) errors.push('details.category is required for poi_addition');
  }
  if (contribution_type === 'trail_addition') {
    if (!details?.trail_name)   errors.push('details.trail_name is required for trail_addition');
    if (!Array.isArray(details?.waypoints) || details.waypoints.length < 2)
      errors.push('details.waypoints must be an array of at least 2 coords for trail_addition');
  }

  if (errors.length > 0)
    return res.status(400).json({ error: 'Validation failed', details: errors });

  next();
}

// ── Anti-spam middleware ───────────────────────────────────────────────────────
//
// Runs two checks in parallel to minimise latency:
//   1. Daily cap: max MAX_DAILY contributions per UTC day per user
//   2. Dedup: no duplicate poi_verification on the same POI within 24 h
//
// Attaches req.dailyRemaining for the success response.

async function antiSpam(req, res, next) {
  const { user_id, contribution_type, poi_id } = req.body;

  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);

  const since24h = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const needsDedupCheck = contribution_type === 'poi_verification' && poi_id;

  // Fire both queries in parallel
  const [dailyResult, dupResult] = await Promise.all([
    supabase
      .from('user_contributions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user_id)
      .gte('created_at', startOfUtcDay.toISOString()),

    needsDedupCheck
      ? supabase
          .from('user_contributions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user_id)
          .eq('poi_id', poi_id)
          .eq('contribution_type', 'poi_verification')
          .gte('created_at', since24h)
      : Promise.resolve({ count: 0, error: null }),
  ]);

  if (dailyResult.error) {
    console.error('[contributions] anti-spam daily count error:', dailyResult.error);
    return res.status(500).json({ error: 'Could not verify rate limit' });
  }
  if (dupResult.error) {
    console.error('[contributions] anti-spam dedup check error:', dupResult.error);
    return res.status(500).json({ error: 'Could not verify for duplicate' });
  }

  if (dailyResult.count >= MAX_DAILY) {
    return res.status(429).json({
      error:           'Daily contribution limit reached',
      detail:          `Max ${MAX_DAILY} contributions per day. Resets at UTC midnight.`,
      remaining_today: 0,
    });
  }

  if (needsDedupCheck && dupResult.count > 0) {
    return res.status(409).json({
      error:  'Duplicate verification',
      detail: 'You already verified this POI in the past 24 hours.',
    });
  }

  req.dailyRemaining = MAX_DAILY - dailyResult.count - 1;
  next();
}

// ── POST /api/contributions/submit ────────────────────────────────────────────

router.post('/submit', validateSubmit, antiSpam, async (req, res) => {
  const { user_id, contribution_type, poi_id, details } = req.body;

  // Sanitize string fields in details to prevent injection via JSONB
  const safeDetails = sanitizeDetails(contribution_type, details ?? {});

  const { data, error } = await supabase.rpc('submit_contribution', {
    p_user_id: user_id,
    p_type:    contribution_type,
    p_poi_id:  poi_id ?? null,
    p_details: safeDetails,
  });

  if (error) {
    if (error.message?.includes('invalid_contribution_type')) {
      return res.status(400).json({ error: 'Invalid contribution type' });
    }
    console.error('[contributions] submit_contribution RPC error:', error);
    return res.status(500).json({ error: 'Failed to submit contribution' });
  }

  return res.status(201).json({
    ...data,
    points_possible: POINTS_BY_TYPE[contribution_type] ?? 0,
    remaining_today: req.dailyRemaining,
  });
});

// ── GET /api/contributions/stats/:userId ──────────────────────────────────────

router.get('/stats/:userId', async (req, res) => {
  const { userId } = req.params;

  if (!UUID_RE.test(userId)) {
    return res.status(400).json({ error: 'userId must be a valid UUID' });
  }

  const { data, error } = await supabase.rpc('get_user_contribution_stats', {
    p_user_id: userId,
  });

  if (error) {
    console.error('[contributions] stats RPC error:', error);
    return res.status(500).json({ error: 'Failed to fetch contribution stats' });
  }

  return res.json(data);
});

// ── POST /api/contributions/redeem ────────────────────────────────────────────

router.post('/redeem', async (req, res) => {
  const { user_id, reward_type } = req.body ?? {};
  const errors = [];

  if (!user_id || !UUID_RE.test(user_id))
    errors.push('user_id must be a valid UUID');
  if (!VALID_REWARDS.has(reward_type))
    errors.push(`reward_type must be one of: ${[...VALID_REWARDS].join(', ')}`);

  if (errors.length > 0)
    return res.status(400).json({ error: 'Validation failed', details: errors });

  const { data, error } = await supabase.rpc('redeem_reward', {
    p_user_id:     user_id,
    p_reward_type: reward_type,
  });

  if (error) {
    if (error.message?.includes('insufficient_points')) {
      const m = error.message.match(/need (\d+), have (\d+)/);
      return res.status(402).json({
        error:   'Insufficient points',
        needed:  m ? parseInt(m[1], 10) : null,
        balance: m ? parseInt(m[2], 10) : null,
      });
    }
    if (error.message?.includes('invalid_reward_type')) {
      return res.status(400).json({ error: 'Invalid reward type' });
    }
    console.error('[contributions] redeem RPC error:', error);
    return res.status(500).json({ error: 'Failed to redeem reward' });
  }

  return res.status(201).json(data);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Strip dangerous keys and truncate strings in user-supplied details
function sanitizeDetails(type, details) {
  const safe = {};

  const truncate  = (s, max) => typeof s === 'string' ? s.trim().slice(0, max) : undefined;
  const safeStr   = (v, max = 500) => truncate(v, max) ?? null;
  const safeFloat = (v) => {
    const n = parseFloat(v);
    return isFinite(n) ? n : null;
  };

  // Always carry trip_id through if present (used for Trip Summary correlation)
  if (details.trip_id && UUID_RE.test(details.trip_id)) safe.trip_id = details.trip_id;

  switch (type) {
    case 'poi_verification':
      if (details.verified_accurate !== undefined)
        safe.verified_accurate = Boolean(details.verified_accurate);
      if (details.notes) safe.notes = safeStr(details.notes, 300);
      break;

    case 'poi_correction':
      safe.correction_text = safeStr(details.correction_text, 1000);
      if (details.field_name) safe.field_name = safeStr(details.field_name, 50);
      break;

    case 'poi_addition':
      safe.name        = safeStr(details.name, 200);
      safe.category    = safeStr(details.category, 80);
      safe.lat         = safeFloat(details.lat);
      safe.lng         = safeFloat(details.lng);
      if (details.description) safe.description = safeStr(details.description, 1000);
      break;

    case 'narration_rating':
      if (['thumbs_up', 'thumbs_down'].includes(details.rating)) safe.rating = details.rating;
      if (details.narration_id) safe.narration_id = safeStr(details.narration_id, 100);
      if (details.poi_id && UUID_RE.test(details.poi_id)) safe.poi_id = details.poi_id;
      break;

    case 'photo_upload':
      safe.photo_url = safeStr(details.photo_url, 500);
      if (details.caption) safe.caption = safeStr(details.caption, 300);
      break;

    case 'trail_addition':
      safe.trail_name = safeStr(details.trail_name, 200);
      // Sanitize waypoints: keep only numeric lat/lng pairs, cap at 500 points
      safe.waypoints  = (Array.isArray(details.waypoints) ? details.waypoints : [])
        .slice(0, 500)
        .map(wp => ({ lat: safeFloat(wp.lat), lng: safeFloat(wp.lng) }))
        .filter(wp => wp.lat !== null && wp.lng !== null);
      if (details.description) safe.description = safeStr(details.description, 1000);
      if (details.difficulty && ['easy', 'moderate', 'hard'].includes(details.difficulty))
        safe.difficulty = details.difficulty;
      break;

    default:
      break;
  }

  return safe;
}

module.exports = router;
