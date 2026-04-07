import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticateToken } from '../middleware/auth';
import { uploadFile, uploadsDir } from '../middleware/upload';
import prisma from '../prisma';
import { canUserAccessUpload, normalizeStoredUploadPath } from '../utils/mediaAccess';

const router = Router();

function getAiConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    translateModel: process.env.OPENAI_MODEL_TRANSLATE || 'gpt-4.1-mini',
    transcribeModel: process.env.OPENAI_MODEL_TRANSCRIBE || 'gpt-4o-mini-transcribe',
  };
}

function requireKey(res: any) {
  if (getAiConfig().apiKey) return true;
  res.status(503).json({
    error: 'OPENAI_API_KEY is not configured',
    hint: 'Add a valid OPENAI_API_KEY in backend/.env to enable translation and transcription.',
  });
  return false;
}

router.get('/status', authenticateToken, async (_req: any, res) => {
  res.json({
    configured: !!getAiConfig().apiKey,
    baseUrl: getAiConfig().baseUrl,
    translateModel: getAiConfig().translateModel,
    transcribeModel: getAiConfig().transcribeModel,
  });
});

async function translateText(text: string, sourceLang: string, targetLang: string) {
  const cfg = getAiConfig();
  const prompt = `Translate the user's text from ${sourceLang} to ${targetLang}. Return JSON with keys translatedText and detectedSourceLanguage. Keep names, URLs, IDs and emails unchanged. Do not add explanations.`;
  const response = await fetch(`${cfg.baseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.translateModel,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: prompt }] },
        { role: 'user', content: [{ type: 'input_text', text }] },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'translation_response',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              translatedText: { type: 'string' },
              detectedSourceLanguage: { type: 'string' },
            },
            required: ['translatedText', 'detectedSourceLanguage'],
          },
        },
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Translate failed: ${response.status} ${text}`);
  }
  const json: any = await response.json();
  const content = json.output?.[0]?.content?.find((c: any) => c.type === 'output_text')?.text || json.output_text || '{}';
  return JSON.parse(content);
}

async function transcribeStream(stream: fs.ReadStream, filename: string, mimeType: string) {
  const cfg = getAiConfig();
  const form = new FormData();
  form.append('model', cfg.transcribeModel);
  form.append('file', new Blob([await fs.promises.readFile(stream.path)], { type: mimeType || 'application/octet-stream' }), filename);
  form.append('response_format', 'json');

  const response = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form as any,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Transcription failed: ${response.status} ${text}`);
  }
  return response.json();
}

router.post('/translate', authenticateToken, async (req: any, res) => {
  try {
    if (!requireKey(res)) return;
    const text = String(req.body?.text || '').trim();
    const sourceLang = String(req.body?.sourceLang || 'auto');
    const targetLang = String(req.body?.targetLang || '').trim();
    if (!text || !targetLang) return res.status(400).json({ error: 'text and targetLang are required' });
    const result = await translateText(text, sourceLang || 'auto', targetLang);
    res.json(result);
  } catch (err: any) {
    console.error('translate error', err);
    res.status(500).json({ error: err?.message || 'Translate failed' });
  }
});

router.post('/transcribe-upload', authenticateToken, uploadFile.single('file'), async (req: any, res) => {
  try {
    if (!requireKey(res)) return;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result: any = await transcribeStream(fs.createReadStream(req.file.path), req.file.originalname, req.file.mimetype);
    res.json({ text: result.text || '', language: result.language || '', duration: result.duration || null });
  } catch (err: any) {
    console.error('transcribe upload error', err);
    res.status(500).json({ error: err?.message || 'Transcription failed' });
  }
});

router.post('/transcribe-from-url', authenticateToken, async (req: any, res) => {
  try {
    if (!requireKey(res)) return;
    const normalized = normalizeStoredUploadPath(String(req.body?.fileUrl || ''));
    if (!normalized) return res.status(400).json({ error: 'Only uploaded local files are supported' });
    const allowed = await canUserAccessUpload(prisma, req.userId, normalized);
    if (!allowed) return res.status(403).json({ error: 'Access denied' });
    const filename = path.basename(normalized);
    const fullPath = path.join(uploadsDir, filename);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found' });
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.webm': 'audio/webm',
      '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
    };
    const result: any = await transcribeStream(fs.createReadStream(fullPath), req.body?.fileName || filename, mimeMap[ext] || 'application/octet-stream');
    res.json({ text: result.text || '', language: result.language || '', duration: result.duration || null });
  } catch (err: any) {
    console.error('transcribe file error', err);
    res.status(500).json({ error: err?.message || 'Transcription failed' });
  }
});

export default router;
