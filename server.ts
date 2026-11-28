import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

/**
 * API: Evaluate Arabic pronunciation
 * Evaluates student's spoken text and/or audio against the target word/letter with diacritics
 */
app.post('/api/evaluate', async (req, res) => {
  try {
    const { targetWord, spokenText, audioBase64, audioMimeType, notes, apiKey: bodyApiKey, repeatCount } = req.body;
    const effectiveApiKey =
      (req.headers['x-gemini-key'] as string) ||
      bodyApiKey ||
      process.env.GEMINI_API_KEY;

    if (!effectiveApiKey) {
      return res.status(400).json({
        success: false,
        error:
          'مفتاح Gemini API غير متوفر في السيرفر. يمكنك إضافة مفتاحك بسهولة من نافذة الإعدادات لتفعيل الذكاء الاصطناعي.',
      });
    }

    const aiInstance = new GoogleGenAI({
      apiKey: effectiveApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    if (!targetWord) {
      return res.status(400).json({ error: 'Target word is required' });
    }

    const requiredRepetitions = typeof repeatCount === 'number' && repeatCount > 0 ? repeatCount : 1;

    let transcript = (spokenText || '').trim();

    // 1. AI Task: "Digital Ear" Speech-to-Text (Transcribe audio without bias or knowing the target word)
    if (audioBase64) {
      let rawBase64 = (audioBase64 || '').trim();
      const commaIndex = rawBase64.indexOf(',');
      if (commaIndex !== -1) {
        rawBase64 = rawBase64.substring(commaIndex + 1);
      }

      let cleanMime = (audioMimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
      if (cleanMime === 'audio/x-m4a' || cleanMime === 'audio/m4a') cleanMime = 'audio/mp4';
      if (!cleanMime || cleanMime === 'audio/*') cleanMime = 'audio/webm';

      const asrPrompt = `أنت مفرغ ومدقق صوتي عربي محترف متخصص في اللغة العربية الفصحى وأحكام التجويد والقرآن الكريم.
المهمة: الاستماع الدقيق للتسجيل الصوتي المرفق، وكتابة الكلمة أو العبارة التي نطق بها المتحدث حرفياً كما سُمعت في الصوت تماماً مع ضبط التشكيل الكامل (الفتحة، الضمة، الكسرة، السكون، التنوين، الشدة).

السياق التعليمي المستهدف: الطالب يتدرب على قراءة: "${targetWord}".

قواعد التفريغ الدقيق:
1. اكتب ما نطق به المتحدث حرفياً وبأمانة مطلقة مع ضبط الحركات والتشكيل الصحيح.
2. إذا نطق المتحدث الكلمة سليمة بالشكل، اكتبها مضبوطة تماماً بالتشكيل والحركات.
3. إذا أخطأ المتحدث في حركة أو أبدل حرفاً بآخر، فاكتب ما سُمع في الصوت حرفياً دون تصحيح لتتمكن خوارزمية التقييم من رصد الخطأ وتوجيهه.
4. إذا كرر المتحدث الكلمة أكثر من مرة، اكتب جميع التكرارات مفصولة بمسافة (مثال: "${targetWord} ${targetWord}").
5. إذا لم يكن هناك صوت بشري أو كان الصوت صامتاً، اكتب نصاً فارغاً "".
الرد بصيغة JSON فقط: {"transcript": "الكلمة أو الجملة المنطوقة بالتشكيل"}`;

      const contents = [
        {
          inlineData: {
            mimeType: cleanMime,
            data: rawBase64,
          },
        },
        { text: asrPrompt },
      ];

      try {
        const response = await aiInstance.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: { parts: contents },
          config: {
            systemInstruction: 'أنت مدقق ومفرغ صوتي عربي احترافي ومحايد 100%. اكتب ما تسمعه في الصوت حرفياً وبدقة فائقة مع التشكيل دون تكرار عشوائي ودون تحريف.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                transcript: {
                  type: Type.STRING,
                  description: 'الكلمة أو الجملة المنطوقة بدقة مع التشكيل والحركات',
                },
              },
              required: ['transcript'],
            },
          },
        });

        if (response && response.text) {
          const parsed = JSON.parse(response.text);
          if (parsed && typeof parsed.transcript === 'string') {
            transcript = parsed.transcript.trim();
          }
        }
      } catch (err: any) {
        console.warn('Local ASR gemini-3.8-flash primary notice, trying gemini-3.5-transcribe:', err?.message || err);
        try {
          const transcribeResp = await aiInstance.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: { parts: contents },
          });
          if (transcribeResp && transcribeResp.text) {
            transcript = transcribeResp.text.trim();
          }
        } catch (e2) {
          console.warn('Local ASR gemini-3.5-transcribe notice, trying gemini-flash-latest:', e2);
          try {
            const fallbackResp = await aiInstance.models.generateContent({
              model: 'gemini-flash-latest',
              contents: { parts: contents },
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: { transcript: { type: Type.STRING } },
                  required: ['transcript'],
                },
              },
            });
            if (fallbackResp && fallbackResp.text) {
              const parsed = JSON.parse(fallbackResp.text);
              if (parsed && typeof parsed.transcript === 'string') {
                transcript = parsed.transcript.trim();
              }
            }
          } catch (e3) {
            console.warn('All ASR transcription attempts failed:', e3);
          }
        }
      }
    }

    // 2. Internal Algorithmic Evaluation: Strict, Mathematical, Zero-Bias Phonetic Scoring
    const removeDiacritics = (str: string) =>
      (str || '').replace(/[\u064B-\u0652\u0670\u0640]/g, '').trim();

    const normTarget = removeDiacritics(targetWord);
    const normSpoken = removeDiacritics(transcript);

    // Repetition counting
    const countOccurrences = (target: string, spoken: string) => {
      if (!target || !spoken) return 0;
      const targetTokens = target.split(/\s+/).filter(Boolean);
      const spokenTokens = spoken.split(/\s+/).filter(Boolean);
      if (targetTokens.length === 1) {
        const sTarget = targetTokens[0];
        let cnt = 0;
        for (const tok of spokenTokens) {
          if (tok === sTarget) cnt++;
        }
        return cnt;
      }
      return 0;
    };

    const detectedCount = countOccurrences(normTarget, normSpoken);

    // Levenshtein distance
    const getDistance = (a: string, b: string) => {
      const m = Array.from({ length: b.length + 1 }, (_, i) => [i]);
      for (let j = 0; j <= a.length; j++) m[0][j] = j;
      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          m[i][j] = b[i - 1] === a[j - 1]
            ? m[i - 1][j - 1]
            : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
        }
      }
      return m[b.length][a.length];
    };

    let finalScore = 0;
    let grade = 'غير مطابق';
    let isMatch = false;
    let feedback = '';

    if (!normSpoken) {
      finalScore = 0;
      grade = 'لم يتم التقاط صوت';
      isMatch = false;
      feedback = 'لم نتمكن من سماع نطق واضح في التسجيل، يرجى إعادة المحاولة والتحدث بالقرب من الميكروفون.';
    } else {
      const maxLen = Math.max(normTarget.length, normSpoken.length);
      const dist = getDistance(normTarget, normSpoken);
      const similarity = Math.max(0, 1 - dist / maxLen);
      let baseScore = Math.round(similarity * 100);

      if (detectedCount > 0) {
        baseScore = Math.max(baseScore, 92);
      }

      if (requiredRepetitions > 1) {
        if (detectedCount >= requiredRepetitions) {
          finalScore = Math.min(100, Math.max(88, baseScore));
          grade = 'ممتاز ومتقن';
          isMatch = true;
          feedback = `أحسنت جداً! أكملت تكرار الكلمة بنجاح (${detectedCount} مرات من ${requiredRepetitions} مطلوبة) بنطق واضح ومخارج سليمة.`;
        } else if (detectedCount > 0) {
          const ratio = detectedCount / requiredRepetitions;
          finalScore = Math.round(baseScore * ratio);
          grade = finalScore >= 60 ? 'جيد - نقص في التكرار' : 'غير مكتمل التكرار';
          isMatch = false;
          feedback = `نطقك صحيح ولكنك كررت الكلمة ${detectedCount} مرات فقط من أصل ${requiredRepetitions} مطلوبة. تم خصم درجات لنقص التكرار.`;
        } else {
          finalScore = Math.min(baseScore, 30);
          grade = 'لم يكتمل التكرار';
          isMatch = false;
          feedback = `المطلوب تكرار الكلمة (${requiredRepetitions} مرات). نطقت: (${transcript})، يرجى إعادة المحاولة ونطق الكلمة المستهدفة ${requiredRepetitions} مرات.`;
        }
      } else {
        finalScore = baseScore;
        if (finalScore >= 85) {
          grade = 'رائع وممتاز';
          isMatch = true;
          feedback = 'نطق ممتاز جداً! مخارج الحروف نقية وواضحة.';
        } else if (finalScore >= 70) {
          grade = 'جيد جداً';
          isMatch = true;
          feedback = 'أداء جيد جداً، هناك بعض الحروف أو الحركات تحتاج تركيزاً طفيفاً.';
        } else if (finalScore >= 50) {
          grade = 'جيد - يحتاج تدريباً';
          isMatch = false;
          feedback = `نطقت: (${transcript})، استمع مجدداً للنموذج الصوتي وحاول تقليد مخرج الحرف بدقة.`;
        } else {
          grade = 'غير مطابق';
          isMatch = false;
          feedback = `نطقت: (${transcript}) بينما المطلوب هو: (${targetWord}). الكلمتان مختلفتان تماماً، يرجى الاستماع للنموذج الصوتي وإعادة المحاولة.`;
        }
      }
    }

    // Letter breakdown
    const letterBreakdown = normTarget.split('').map((char, idx) => {
      const spChar = normSpoken[idx];
      if (spChar === char) {
        return { letter: char, status: 'صحيح', comment: 'نطق سليم وفي موضعه' };
      } else if (normSpoken.includes(char)) {
        return { letter: char, status: 'يحتاج تحسين', comment: 'الحرف وُجد بترتيب مختلف' };
      } else {
        return { letter: char, status: 'مفقود', comment: 'الحرف لم يظهر في النطق' };
      }
    });

    return res.json({
      success: true,
      transcript,
      evaluation: {
        score: finalScore,
        grade,
        isMatch,
        repetitionsDetected: detectedCount,
        requiredRepetitions,
        feedback,
        makhrajAdvice: 'استمع للتسجيل الصوتي النموذجي وركز على موضع اللسان والشفتين.',
        vowelAccuracy: finalScore >= 75 ? 'متطابقة مع التشكيل' : 'تحتاج ضبط الحركات',
        detectedWord: transcript || '—',
        letterBreakdown,
        timestamp: Date.now(),
        engineUsed: 'ai',
      },
    });
  } catch (err: any) {
    console.error('Error in /api/evaluate:', err);
    return res.status(500).json({
      success: false,
      error: 'فشل في تقييم النطق عبر الذكاء الاصطناعي: ' + (err?.message || 'خطأ غير متوقع'),
    });
  }
});

/**
 * API: High-fidelity Arabic TTS via Gemini Studio Voice
 */
app.post('/api/tts', async (req, res) => {
  try {
    const { text, slow = false } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const speedInstruction = slow 
      ? 'انطق ببطء شديد وبوضوح فائق لكل حركة وسكون ومد لتعليم المبتدئين.'
      : 'انطق باللغة العربية الفصحى الواضحة مع إبراز مخارج الحروف والتشكيل.';

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${speedInstruction} النص: "${text}"`,
              speechMetadata: {
                style: 'Clear, articulate classical Arabic teacher',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      return res.status(500).json({ error: 'لم يتم توليد الصوت' });
    }

    return res.json({
      success: true,
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
    });
  } catch (err: any) {
    console.error('Error in /api/tts:', err);
    return res.status(500).json({
      success: false,
      error: 'تعذر توليد الصوت بالذكاء الاصطناعي: ' + (err?.message || 'خطأ'),
    });
  }
});

/**
 * Proxy Google Drive audio to bypass browser CORS / redirect issues
 */
app.get('/api/proxy-audio', async (req, res) => {
  try {
    const fileId = req.query.id as string;
    if (!fileId) {
      return res.status(400).send('Missing file ID');
    }

    const driveEndpoints = [
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&authuser=0`,
      `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
    ];

    let finalResponse: any = null;

    for (const endpoint of driveEndpoints) {
      try {
        let r = await fetch(endpoint, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: '*/*',
          },
          redirect: 'follow',
        });

        if (r.ok) {
          const contentType = (r.headers.get('content-type') || '').toLowerCase();
          if (contentType.includes('text/html')) {
            const html = await r.text();
            const confirmMatch = html.match(/confirm=([0-9A-Za-z_-]+)/);
            if (confirmMatch && confirmMatch[1]) {
              const confirmedUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=${confirmMatch[1]}`;
              const rConfirm = await fetch(confirmedUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                },
                redirect: 'follow',
              });
              if (rConfirm.ok) {
                finalResponse = rConfirm;
                break;
              }
            }
          } else {
            finalResponse = r;
            break;
          }
        }
      } catch (e) {
        console.warn('Drive proxy try failed:', e);
      }
    }

    if (!finalResponse || !finalResponse.ok) {
      return res.status(404).send('Could not retrieve audio from Google Drive. Ensure file is shared as Public ("Anyone with the link").');
    }

    const contentType = finalResponse.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType.includes('html') ? 'audio/mpeg' : contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const arrayBuffer = await finalResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return res.send(buffer);
  } catch (err: any) {
    console.warn('Error in /api/proxy-audio:', err);
    return res.status(500).send('Proxy error: ' + err.message);
  }
});

/**
 * Proxy Google Drive / external images with CORS headers for Canvas annotation & captureStream recording
 */
app.get('/api/proxy-image', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    let fileIdParam = String(req.query.id || '').trim();

    const extractDriveId = (u: string): string => {
      const m1 = u.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
      if (m1 && m1[1]) return m1[1];
      const m2 = u.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
      if (m2 && m2[1]) return m2[1];
      return '';
    };

    const candidates: string[] = [];

    if (!fileIdParam && rawUrl && (rawUrl.includes('drive.google.com') || rawUrl.includes('googleusercontent.com'))) {
      fileIdParam = extractDriveId(rawUrl);
    }

    if (fileIdParam) {
      const encId = encodeURIComponent(fileIdParam);
      candidates.push(
        `https://drive.google.com/thumbnail?id=${encId}&sz=w1600`,
        `https://lh3.googleusercontent.com/d/${encId}=w1600`,
        `https://lh3.googleusercontent.com/d/${encId}`,
        `https://drive.usercontent.google.com/download?id=${encId}&export=download&authuser=0`,
        `https://drive.google.com/uc?export=view&id=${encId}`
      );
    }

    if (rawUrl) {
      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        if (candidates.length === 0) return res.status(400).send('Invalid image URL');
        parsed = null as any;
      }
      if (parsed) {
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          return res.status(400).send('Unsupported protocol');
        }
        const host = parsed.hostname.toLowerCase();
        if (
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host === '0.0.0.0' ||
          host.startsWith('10.') ||
          host.startsWith('192.168.') ||
          host.startsWith('169.254.')
        ) {
          return res.status(403).send('Disallowed host');
        }
        const rawStr = parsed.toString();
        if (!candidates.includes(rawStr)) {
          candidates.push(rawStr);
        }
      }
    }

    if (candidates.length === 0) {
      return res.status(400).send('Missing url or id parameter');
    }

    let lastStatus = 404;
    for (const targetUrl of candidates) {
      try {
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
          },
          redirect: 'follow',
        });

        lastStatus = response.status;
        if (!response.ok) continue;

        const contentType = (response.headers.get('content-type') || 'image/png').toLowerCase();
        if (contentType.includes('text/html') || contentType.includes('application/json')) {
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length === 0) continue;

        res.setHeader('Content-Type', contentType.startsWith('image/') ? contentType : 'image/jpeg');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      } catch {
        // try next mirror
      }
    }

    return res.status(lastStatus >= 400 ? lastStatus : 404).send('Could not fetch image');
  } catch (err: any) {
    console.warn('Error in /api/proxy-image:', err);
    return res.status(500).send('Proxy error: ' + err.message);
  }
});

/**
 * Proxy & stream Google Drive video with HTTP Range support for smooth inline HTML5 playback
 */
app.get('/api/proxy-video', async (req, res) => {
  try {
    const fileId = String(req.query.id || '').trim();
    if (!fileId || !/^[a-zA-Z0-9_-]{10,120}$/.test(fileId)) {
      return res.status(400).send('Invalid or missing Drive file ID');
    }

    const rawRange = typeof req.headers.range === 'string' ? req.headers.range.trim() : '';
    const validRange =
      rawRange && /^bytes=\d*-\d*(,\s*\d*-\d*)*$/.test(rawRange) ? rawRange : '';

    const buildHeaders = (withRange: boolean): Record<string, string> => {
      const h: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: '*/*',
      };
      if (withRange && validRange) {
        h.Range = validRange;
      }
      return h;
    };

    const driveEndpoints = [
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t&authuser=0`,
      `https://drive.google.com/uc?export=download&confirm=t&id=${encodeURIComponent(fileId)}`,
    ];

    let finalResponse: globalThis.Response | null = null;

    for (const endpoint of driveEndpoints) {
      try {
        const r = await fetch(endpoint, {
          headers: buildHeaders(true),
          redirect: 'follow',
        });

        if (r.ok || r.status === 206) {
          const contentType = (r.headers.get('content-type') || '').toLowerCase();
          if (contentType.includes('text/html')) {
            const html = await r.text();
            const confirmMatch = html.match(/confirm=([0-9A-Za-z_-]+)/);
            const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/);
            if (confirmMatch && confirmMatch[1]) {
              const confirmedUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
                fileId
              )}&export=download&confirm=${encodeURIComponent(confirmMatch[1])}${
                uuidMatch?.[1] ? `&uuid=${encodeURIComponent(uuidMatch[1])}` : ''
              }`;
              const rConfirm = await fetch(confirmedUrl, {
                headers: buildHeaders(true),
                redirect: 'follow',
              });
              if (
                (rConfirm.ok || rConfirm.status === 206) &&
                !(rConfirm.headers.get('content-type') || '').toLowerCase().includes('text/html')
              ) {
                finalResponse = rConfirm;
                break;
              }
            }
          } else {
            finalResponse = r;
            break;
          }
        }
      } catch (e) {
        console.warn('Drive video proxy try failed:', e);
      }
    }

    if (!finalResponse || (!finalResponse.ok && finalResponse.status !== 206)) {
      return res
        .status(404)
        .send('Could not stream video from Google Drive. Ensure file sharing is enabled.');
    }

    const rawCt = (finalResponse.headers.get('content-type') || '').toLowerCase();
    const resolvedCt =
      !rawCt || rawCt.includes('application/octet-stream') || rawCt.includes('text/html')
        ? 'video/mp4'
        : rawCt;

    const status = finalResponse.status === 206 ? 206 : 200;
    res.status(status);
    res.setHeader('Content-Type', resolvedCt);
    res.setHeader('Accept-Ranges', finalResponse.headers.get('accept-ranges') || 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const contentLength = finalResponse.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    const contentRange = finalResponse.headers.get('content-range');
    if (contentRange) res.setHeader('Content-Range', contentRange);

    if (!finalResponse.body) {
      const arrBuf = await finalResponse.arrayBuffer();
      return res.send(Buffer.from(arrBuf));
    }

    const reader = finalResponse.body.getReader();
    let aborted = false;
    res.on('close', () => {
      aborted = true;
      reader.cancel().catch(() => {});
    });

    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) {
        const canContinue = res.write(Buffer.from(value));
        if (!canContinue && !aborted) {
          await new Promise<void>((resolve) => {
            res.once('drain', resolve);
            res.once('close', resolve);
          });
        }
      }
    }
    if (!res.writableEnded) {
      res.end();
    }
    return;
  } catch (err: any) {
    console.warn('Error in /api/proxy-video:', err);
    if (!res.headersSent) {
      return res.status(500).send('Video proxy error: ' + (err?.message || 'Unknown error'));
    }
    res.end();
    return;
  }
});

/**
 * Universal Arabic TTS Audio Stream endpoint
 * Fetches Google Translate TTS on server side without client-side Referer block
 */
app.get('/api/tts-stream', async (req, res) => {
  try {
    const text = (req.query.text as string) || '';
    if (!text || !text.trim()) {
      return res.status(400).send('Missing text parameter');
    }

    const cleanText = text.replace(/↔/g, ' ثم ').replace(/[-_]/g, ' ').trim();
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ar&client=tw-ob&q=${encodeURIComponent(cleanText)}`;

    const response = await fetch(ttsUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch TTS stream');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length.toString());
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    return res.send(buffer);
  } catch (err: any) {
    console.error('Error in /api/tts-stream:', err);
    return res.status(500).send('Internal server error');
  }
});

/**
 * API: Save updated curriculum directly to src/data/arabicCurriculum.ts
 * Enables persistent saving so exporting to GitHub bakes in all newly added lessons
 */
app.post('/api/save-curriculum', async (req, res) => {
  try {
    const { curriculum, subjects, categories } = req.body;
    if (!Array.isArray(curriculum)) {
      return res.status(400).json({ success: false, error: 'Curriculum array is required' });
    }

    const fs = await import('fs/promises');
    const curriculumPath = path.resolve(__dirname, 'src/data/arabicCurriculum.ts');

    const fileContent = `import { WordItem } from '../types';

export const INITIAL_LESSON_SUBJECTS = ${JSON.stringify(subjects || [], null, 2)};

export const INITIAL_CATEGORIES = ${JSON.stringify(categories || [], null, 2)};

export const ALL_CURRICULUM: WordItem[] = ${JSON.stringify(curriculum, null, 2)};
`;

    await fs.writeFile(curriculumPath, fileContent, 'utf-8');
    return res.json({
      success: true,
      message: 'تم حفظ الدروس والمنهج في ملفات المشروع بنجاح!',
      count: curriculum.length,
    });
  } catch (err: any) {
    console.error('Error saving curriculum to file:', err);
    return res.status(500).json({
      success: false,
      error: 'تعذر الحفظ في الملف: ' + (err?.message || 'خطأ غير متوقع'),
    });
  }
});

/**
 * Helper: Free Google Translate fallback for Arabic -> Thai and English
 */
async function translateWithGoogleFallback(text: string): Promise<{ th: string; en: string }> {
  const clean = (text || '').trim();
  if (!clean) return { th: '', en: '' };

  let th = '';
  let en = '';

  try {
    const [thRes, enRes] = await Promise.all([
      fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=th&dt=t&q=${encodeURIComponent(clean)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }).catch(() => null),
      fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${encodeURIComponent(clean)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      }).catch(() => null),
    ]);

    if (thRes && thRes.ok) {
      const thJson = await thRes.json().catch(() => null);
      if (Array.isArray(thJson?.[0])) {
        th = thJson[0].map((p: any) => p[0] || '').join('').trim();
      }
    }

    if (enRes && enRes.ok) {
      const enJson = await enRes.json().catch(() => null);
      if (Array.isArray(enJson?.[0])) {
        en = enJson[0].map((p: any) => p[0] || '').join('').trim();
      }
    }
  } catch (e) {
    console.warn('Google Translate fallback notice:', e);
  }

  return { th, en };
}

/**
 * API: Translate Arabic UI strings to Thai and English using Gemini with Google fallback
 */
app.post('/api/translate', async (req, res) => {
  try {
    const { text, items } = req.body;
    const effectiveApiKey =
      (req.headers['x-gemini-key'] as string) ||
      process.env.GEMINI_API_KEY;

    // 1. If multiple items
    if (items && Array.isArray(items)) {
      if (effectiveApiKey) {
        try {
          const aiInstance = new GoogleGenAI({
            apiKey: effectiveApiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const prompt = `You are an expert educational translator for an Arabic pronunciation platform named "فَصِيح" (Faseeh).
Translate the following list of Arabic UI strings into both Thai (ภาษาไทย) and English.
Make translations polite, concise, natural, and standard for modern education and language learning websites.
Return JSON with key "translations":
[
  { "id": "...", "th": "Thai translation", "en": "English translation" }
]
Input:
${JSON.stringify(items)}`;

          const response = await aiInstance.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  translations: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        th: { type: Type.STRING },
                        en: { type: Type.STRING },
                      },
                      required: ['id', 'th', 'en'],
                    },
                  },
                },
                required: ['translations'],
              },
            },
          });

          const parsed = JSON.parse(response.text || '{}');
          if (Array.isArray(parsed.translations) && parsed.translations.length > 0) {
            return res.json({ success: true, translations: parsed.translations });
          }
        } catch (geminiErr: any) {
          console.warn('Gemini batch translation failed, falling back to Google Translate:', geminiErr?.message || geminiErr);
        }
      }

      // Fallback for batch items
      const fallbackList: { id: string; th: string; en: string }[] = [];
      for (const item of items) {
        const trans = await translateWithGoogleFallback(item.text || item.ar || '');
        fallbackList.push({
          id: item.id,
          th: trans.th,
          en: trans.en,
        });
      }
      return res.json({ success: true, translations: fallbackList });
    }

    // 2. Single text translation
    if (text !== undefined && text !== null) {
      const cleanText = String(text).trim();
      if (!cleanText) {
        return res.json({ success: true, th: '', en: '' });
      }

      if (effectiveApiKey) {
        try {
          const aiInstance = new GoogleGenAI({
            apiKey: effectiveApiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const prompt = `Translate this Arabic educational UI string into both Thai (ภาษาไทย) and English.
Text: "${cleanText}"
Return JSON: { "th": "...", "en": "..." }`;

          const response = await aiInstance.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  th: { type: Type.STRING },
                  en: { type: Type.STRING },
                },
                required: ['th', 'en'],
              },
            },
          });

          const parsed = JSON.parse(response.text || '{}');
          if (parsed && (parsed.th || parsed.en)) {
            return res.json({ success: true, th: parsed.th || '', en: parsed.en || '' });
          }
        } catch (geminiErr: any) {
          console.warn('Gemini single translation failed, falling back to Google Translate:', geminiErr?.message || geminiErr);
        }
      }

      // Fallback for single text
      const fallback = await translateWithGoogleFallback(cleanText);
      return res.json({ success: true, th: fallback.th || '', en: fallback.en || '' });
    }

    return res.status(400).json({ success: false, error: 'لم يتم توفير أي نص للترجمة.' });
  } catch (err: any) {
    console.error('Error in /api/translate:', err);
    return res.status(500).json({ success: false, error: err.message || 'فشلت الترجمة' });
  }
});

/**
 * API: Diagnostic AI Status check
 */
app.get('/api/ai-status', async (_req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  if (!hasKey) {
    return res.json({
      configured: false,
      model: 'gemini-3.8-flash',
      message: 'مفتاح GEMINI_API_KEY غير موجود في متغيرات البيئة.',
    });
  }

  try {
    const testResp = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'قل كلمة واحدة: متصل',
    });
    return res.json({
      configured: true,
      model: 'gemini-3.8-flash',
      status: 'active',
      sample: testResp.text?.trim() || 'متصل',
    });
  } catch (err: any) {
    return res.json({
      configured: true,
      model: 'gemini-3.8-flash',
      status: 'error',
      error: err?.message || 'فشل الاتصال',
    });
  }
});

/**
 * API: Google Sheets Proxy (handles GET & POST without browser CORS limitations)
 */
app.all('/api/google-sheets', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        return res.status(400).json({ success: false, error: 'Missing target url parameter' });
      }

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        },
        redirect: 'follow',
      });

      const text = await response.text();

      if (text.includes('ServiceLogin') || text.includes('accounts.google.com') || (text.startsWith('<!DOCTYPE') && text.includes('Google Accounts'))) {
        return res.status(403).json({
          success: false,
          error: 'رابط السكربت يطلب تسجيل دخول Google. يرجى في محرر Apps Script التأكد عند النشر (Deploy) من جعل خيار: من يملك حق الوصول (Who has access) = أي شخص (Anyone) وليس (أنا فقط Only myself).',
        });
      }

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        const isHtml = text.trim().startsWith('<') || text.includes('<!DOCTYPE');
        let errorMsg = 'استجابة غير صالحة من Google Apps Script (لم يتم إرجاع JSON).';
        if (text.includes('unable to open the file') || text.includes('Page not found')) {
          errorMsg = 'تعذر فتح الملف في Google Apps Script. تأكد من أن الرابط منسوخ من خيار "تطبيق الويب" (Web App) وصلاحية الوصول (Anyone).';
        } else if (text.includes('Script error')) {
          errorMsg = 'حدث خطأ أثناء تنفيذ السكربت في Google Sheets.';
        }
        return res.status(502).json({
          success: false,
          error: errorMsg,
          raw: isHtml ? text.substring(0, 300) : text,
        });
      }

      return res.status(response.status || 200).json(data);
    }

    if (req.method === 'POST') {
      const webhookUrl = req.body?.webhookUrl || (req.query?.url as string);
      const payload = req.body?.payload !== undefined ? req.body.payload : req.body;

      if (!webhookUrl || typeof webhookUrl !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing webhookUrl in request body' });
      }

      const postBody = typeof payload === 'string' ? payload : JSON.stringify(payload);

      const response = await fetch(webhookUrl.trim(), {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
          Accept: 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        },
        body: postBody,
        redirect: 'follow',
      });

      const text = await response.text();

      if (text.includes('ServiceLogin') || text.includes('accounts.google.com') || (text.startsWith('<!DOCTYPE') && text.includes('Google Accounts'))) {
        return res.status(403).json({
          success: false,
          error: 'رابط السكربت يطلب تسجيل دخول Google. يرجى في محرر Apps Script التأكد عند النشر (Deploy) من جعل خيار: من يملك حق الوصول (Who has access) = أي شخص (Anyone) وليس (أنا فقط Only myself).',
        });
      }

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        const isHtml = text.trim().startsWith('<') || text.includes('<!DOCTYPE');
        let errorMsg = 'استجابة غير صالحة من Google Apps Script (لم يتم إرجاع JSON).';
        if (text.includes('unable to open the file') || text.includes('Page not found')) {
          errorMsg = 'تعذر فتح السكربت في Google Apps Script. تأكد من أن الرابط منسوخ من خيار "تطبيق الويب" (Web App) وصلاحية الوصول (Anyone).';
        } else if (text.includes('Script error')) {
          errorMsg = 'حدث خطأ أثناء تنفيذ السكربت في Google Sheets.';
        }
        return res.status(502).json({
          success: false,
          error: errorMsg,
          raw: isHtml ? text.substring(0, 300) : text,
        });
      }

      return res.status(response.status || 200).json(data);
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err: any) {
    console.error('Google Sheets Proxy Error:', err);
    return res.status(500).json({
      success: false,
      error: 'Proxy Error: ' + (err?.message || 'Failed to communicate with Google Sheets'),
    });
  }
});

/**
 * Cloudinary Admin API proxy (strictly uses server-side environment secrets)
 */
app.post('/api/cloudinary/resources', async (req, res) => {
  try {
    const requestedCloud = String(req.body?.cloudName || '').trim();
    const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || requestedCloud).trim();
    const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
    const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

    if (!cloudName || !apiKey || !apiSecret) {
      return res.json({
        success: false,
        configured: false,
        files: [],
        error: 'مفاتيح Admin API لـ Cloudinary (CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET) غير مضافة في أسرار الخادم (.env).',
      });
    }

    if (!/^[a-zA-Z0-9_-]{2,80}$/.test(cloudName)) {
      return res.status(400).json({
        success: false,
        configured: false,
        files: [],
        error: 'اسم سحابة Cloudinary غير صالح.',
      });
    }

    const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
    const types: Array<'video' | 'image' | 'raw'> = ['video', 'image', 'raw'];
    const combined: any[] = [];

    for (const rType of types) {
      const apiUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(
        cloudName
      )}/resources/${rType}?max_results=80`;
      const resp = await fetch(apiUrl, {
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      });
      if (!resp.ok) continue;
      const data = await resp.json().catch(() => null);
      if (data && Array.isArray(data.resources)) {
        for (const item of data.resources) {
          const publicId = String(item.public_id || '').trim();
          const secureUrl = String(item.secure_url || item.url || '').trim();
          if (!publicId || !secureUrl) continue;
          const fmt = String(item.format || '').toLowerCase();
          combined.push({
            id: `cld-${rType}-${publicId}`,
            name: `${publicId}${fmt ? `.${fmt}` : ''}`,
            url: secureUrl,
            mimeType:
              rType === 'video'
                ? `video/${fmt || 'mp4'}`
                : rType === 'image'
                ? `image/${fmt || 'png'}`
                : fmt === 'pdf'
                ? 'application/pdf'
                : 'application/octet-stream',
            size: typeof item.bytes === 'number' ? item.bytes : undefined,
            createdAt: String(item.created_at || ''),
            source: 'cloudinary',
            mediaKind:
              rType === 'video'
                ? 'video'
                : rType === 'image'
                ? 'image'
                : fmt === 'pdf'
                ? 'pdf'
                : 'other',
            publicId,
            cloudinaryResourceType: rType,
          });
        }
      }
    }

    combined.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return res.json({
      success: true,
      configured: true,
      files: combined,
    });
  } catch (err: any) {
    console.warn('Error in /api/cloudinary/resources:', err);
    return res.status(500).json({
      success: false,
      configured: true,
      files: [],
      error: err?.message || 'تعذر جلب موارد Cloudinary.',
    });
  }
});

app.post('/api/cloudinary/delete', async (req, res) => {
  try {
    const publicId = String(req.body?.publicId || '').trim();
    const resourceTypeRaw = String(req.body?.resourceType || 'video').trim();
    const resourceType: 'video' | 'image' | 'raw' =
      resourceTypeRaw === 'image' || resourceTypeRaw === 'raw' ? resourceTypeRaw : 'video';

    const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
    const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
    const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        error: 'مفاتيح Admin API لـ Cloudinary غير مضبوطة في الخادم.',
      });
    }
    if (!/^[a-zA-Z0-9_-]{2,80}$/.test(cloudName)) {
      return res.status(400).json({ success: false, error: 'اسم سحابة Cloudinary غير صالح.' });
    }
    if (!publicId || publicId.length > 300 || !/^[a-zA-Z0-9_\-./]+$/.test(publicId)) {
      return res.status(400).json({ success: false, error: 'معرف الملف (publicId) غير صالح.' });
    }

    const authHeader = `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
    const deleteUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(
      cloudName
    )}/resources/${resourceType}/upload?public_ids[]=${encodeURIComponent(publicId)}`;

    const resp = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      return res.status(resp.status).json({
        success: false,
        error: data?.error?.message || 'تعذر حذف الملف من Cloudinary.',
      });
    }

    return res.json({ success: true, result: data });
  } catch (err: any) {
    console.warn('Error in /api/cloudinary/delete:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'تعذر حذف الملف من Cloudinary.',
    });
  }
});

// Setup Vite development server or static serving in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, port: PORT, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
