import { readdir } from 'fs/promises';
import { join } from 'path';

export type Mode = 'family' | 'kids' | 'unfiltered' | 'local';

export interface VoiceInfo {
  voiceId: string;
  tier: 'chirp3-hd' | 'neural2' | 'wavenet' | 'standard';
  gender: string;
}

export interface ModeMeta {
  label: string;
  description: string;
  speakingRate: number;
}

export const MODES: readonly Mode[] = ['family', 'kids', 'unfiltered', 'local'];

export const MODE_META: Record<Mode, ModeMeta> = {
  family:     { label: 'Family',     speakingRate: 1.0,  description: 'Warm documentary narrator — clear, mid-range, authoritative but not stuffy. Measured pace.' },
  kids:       { label: 'Kids',       speakingRate: 1.1,  description: 'Junior Explorer — enthusiastic science teacher. Higher energy, expressive, slightly faster.' },
  unfiltered: { label: 'Unfiltered', speakingRate: 0.95, description: 'Off the Leash — sharp deadpan friend. Dry, lower register, slight smirk. Slower pace for comedy.' },
  local:      { label: 'Local',      speakingRate: 1.0,  description: 'Insider neighbor — conversational, slightly informal. Sounds like someone telling you a story over coffee.' },
};

export const PASSAGES: Record<Mode, string> = {
  family:
    'The Golden Gate Bridge opened in 1937, after four years of construction across the most challenging stretch of water on the California coast.',
  kids:
    'Whoa, look at this! The Golden Gate Bridge is so big that the cables holding it up could wrap around the Earth three times if you stretched them out!',
  unfiltered:
    'The Golden Gate Bridge. It is a bridge. It is golden-ish. They built it during the Depression because apparently nothing says "we have hope for the future" like a giant orange suspension cable over a fault line.',
  local:
    'Most people hit the Vista Point on the north side and call it a day. If you want the actual best view, walk down to Battery Spencer at sunset — that is where the photographers go.',
};

// 3 recommended candidates per mode — highlighted in the HTML.
// The tool generates samples for these by default (--all to generate all voices).
export const CANDIDATES: Record<Mode, readonly string[]> = {
  family:     ['en-US-Chirp3-HD-Aoede',   'en-US-Chirp3-HD-Charon',  'en-US-Chirp3-HD-Kore'],
  kids:       ['en-US-Chirp3-HD-Puck',    'en-US-Chirp3-HD-Zephyr',  'en-US-Chirp3-HD-Leda'],
  unfiltered: ['en-US-Chirp3-HD-Fenrir',  'en-US-Chirp3-HD-Orus',    'en-US-Neural2-D'],
  local:      ['en-US-Chirp3-HD-Umbriel', 'en-US-Chirp3-HD-Sulafat', 'en-US-Chirp3-HD-Schedar'],
};

function tierFromVoiceId(id: string): VoiceInfo['tier'] {
  if (id.includes('Chirp3-HD')) return 'chirp3-hd';
  if (id.includes('Neural2'))   return 'neural2';
  if (id.includes('WaveNet'))   return 'wavenet';
  return 'standard';
}

function tierLabel(tier: VoiceInfo['tier']): string {
  return tier === 'chirp3-hd' ? 'Chirp3-HD' : tier === 'neural2' ? 'Neural2' : tier;
}

function voiceCard(voiceId: string, mode: Mode, info: VoiceInfo | undefined, isCandidate: boolean): string {
  const tier   = info?.tier   ?? tierFromVoiceId(voiceId);
  const gender = info?.gender ?? '';
  const tClass = tier === 'chirp3-hd' ? 'hd' : 'n2';
  const shortId = voiceId.replace('en-US-', '');

  return `
      <div class="vc${isCandidate ? ' cand' : ''}">
        <div class="vcl">
          <div class="vi">
            <span class="badge ${tClass}">${tierLabel(tier)}</span>${isCandidate ? '<span class="badge star">Candidate</span>' : ''}
            <span class="vn">${shortId}</span>
          </div>
          ${gender ? `<div class="vm">${gender.toLowerCase()}</div>` : ''}
        </div>
        <audio controls preload="none" src="${mode}/${voiceId}.opus"></audio>
      </div>`;
}

export async function generateHTML(
  outputDir: string,
  voiceMap: Map<string, VoiceInfo>,
): Promise<string> {
  // Scan output dirs to find which audio files were actually generated
  const modeVoices: Record<Mode, string[]> = { family: [], kids: [], unfiltered: [], local: [] };
  for (const mode of MODES) {
    try {
      const files = await readdir(join(outputDir, mode));
      modeVoices[mode] = files
        .filter(f => f.endsWith('.opus'))
        .map(f => f.slice(0, -5))
        .sort((a, b) => {
          const aC = CANDIDATES[mode].includes(a);
          const bC = CANDIDATES[mode].includes(b);
          if (aC && !bC) return -1;
          if (bC && !aC) return 1;
          return a.localeCompare(b);
        });
    } catch { /* dir not yet created */ }
  }

  const sections = MODES.map(mode => {
    const meta   = MODE_META[mode];
    const voices = modeVoices[mode];
    const cards  = voices.length === 0
      ? '<div class="empty">No audio yet — run <code>npm run audition</code></div>'
      : voices.map(id => voiceCard(id, mode, voiceMap.get(id), CANDIDATES[mode].includes(id))).join('');

    return `
  <section class="ms" id="m-${mode}">
    <div class="mh">
      <h2>${meta.label}</h2>
      <div class="md">${meta.description} &nbsp;·&nbsp; speaking rate <strong>${meta.speakingRate}×</strong></div>
      <blockquote class="passage">${PASSAGES[mode]}</blockquote>
    </div>
    <div class="vl">${cards}
    </div>
  </section>`;
  }).join('\n');

  const tabButtons = MODES.map((m, i) =>
    `<button class="tab${i === 0 ? ' on' : ''}" onclick="sw('${m}',this)">${MODE_META[m].label}</button>`
  ).join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>XRoad Voice Audition</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#131324;color:#ddd;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh}
header{display:flex;align-items:baseline;gap:14px;padding:18px 28px;border-bottom:1px solid #252540}
h1{font-size:18px;color:#2EC4B6;letter-spacing:.4px}
.sub{color:#555;font-size:12px}
nav{display:flex;gap:4px;padding:10px 28px;background:#0e0e20;border-bottom:1px solid #252540}
.tab{padding:6px 16px;border-radius:6px;cursor:pointer;color:#666;font-size:13px;background:none;border:none;font-family:inherit;transition:color .15s}
.tab:hover{color:#aaa;background:#1a1a30}
.tab.on{background:#2EC4B6;color:#0e0e20;font-weight:600}
.warn{margin:14px 28px 0;padding:8px 14px;background:#1a1000;border:1px solid #5a3800;border-radius:6px;font-size:12px;color:#a06020}
.ms{display:none;padding:22px 28px}
.ms.on{display:block}
.mh{margin-bottom:16px}
.mh h2{font-size:17px;color:#fff;margin-bottom:4px}
.md{color:#666;font-size:12px;margin-bottom:10px}
.passage{border-left:3px solid #2EC4B6;padding:9px 13px;font-size:13px;color:#999;font-style:italic;line-height:1.55;background:#0e0e20;border-radius:0 4px 4px 0;margin-bottom:18px}
.vl{display:flex;flex-direction:column;gap:7px}
.vc{background:#0e0e20;border:1px solid #252540;border-radius:8px;padding:11px 14px;display:flex;align-items:center;gap:14px}
.vc.cand{border-color:#2EC4B6}
.vcl{min-width:300px}
.vi{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.vn{font-family:'SF Mono','Fira Code',monospace;font-size:13px;color:#fff}
.vm{font-size:11px;color:#555;margin-top:3px}
.badge{font-size:10px;padding:2px 7px;border-radius:10px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
.badge.hd{background:#0a3836;color:#2EC4B6;border:1px solid #2EC4B6}
.badge.n2{background:#252540;color:#777}
.badge.star{background:#2a1c00;color:#f59e0b;border:1px solid #f59e0b}
audio{flex:1;height:30px;min-width:180px}
.empty{color:#555;font-size:13px;font-style:italic;padding:16px 0}
code{background:#252540;padding:1px 5px;border-radius:3px;font-size:11px}
</style>
</head>
<body>
<header>
  <h1>XRoad Voice Audition</h1>
  <span class="sub">Google Cloud TTS &nbsp;·&nbsp; en-US Chirp3-HD &amp; Neural2 &nbsp;·&nbsp; Candidate = recommended for this mode</span>
</header>
<nav>
    ${tabButtons}
</nav>
<div class="warn">⚠ OGG/Opus audio — requires Chrome or Firefox. Safari will not play these files.</div>
${sections}
<script>
function sw(mode,btn){
  document.querySelectorAll('.ms').forEach(s=>s.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('on'));
  document.getElementById('m-'+mode).classList.add('on');
  btn.classList.add('on');
}
</script>
</body>
</html>`;
}
