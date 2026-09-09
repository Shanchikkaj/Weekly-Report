import { AIProvider, GenerateTextOptions } from './AIProvider';

type GoogleGenAIInstance = InstanceType<(typeof import('@google/genai', { with: { 'resolution-mode': 'import' } }))['GoogleGenAI']>;

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly model: string;
  private apiKey: string;
  private client: GoogleGenAIInstance | null = null;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = (apiKey !== undefined ? apiKey : (process.env.GEMINI_API_KEY || '')).trim();
    const envModel = (model !== undefined ? model : (process.env.GEMINI_MODEL || '')).trim();

    if (!envModel) {
      throw new Error('GEMINI_MODEL environment variable is not configured. Please set GEMINI_MODEL (e.g. gemini-3.5-flash-lite).');
    }
    this.model = envModel;
  }

  private async getClient(apiKey: string): Promise<GoogleGenAIInstance> {
    if (!this.client || this.apiKey !== apiKey) {
      this.apiKey = apiKey;
      const { GoogleGenAI: GoogleGenAIClass } = await import('@google/genai');
      this.client = new GoogleGenAIClass({ apiKey: this.apiKey });
    }
    return this.client;
  }

  async generateText(prompt: string, options?: GenerateTextOptions): Promise<string> {
    const activeKey = this.apiKey || (process.env.GEMINI_API_KEY || '').trim();
    if (!activeKey) {
      throw new Error('GEMINI_API_KEY is not configured on the server.');
    }

    const activeModel = this.model || (process.env.GEMINI_MODEL || '').trim();
    if (!activeModel) {
      throw new Error('GEMINI_MODEL environment variable is not configured.');
    }

    const client = await this.getClient(activeKey);

    try {
      const maxTokens = options?.maxTokens ?? 2048;
      let response = await client.models.generateContent({
        model: activeModel,
        contents: prompt,
        config: {
          systemInstruction: options?.systemInstruction,
          temperature: options?.temperature ?? 0.2,
          maxOutputTokens: maxTokens,
        },
      });

      let candidate = response.candidates?.[0];
      let finishReason = candidate?.finishReason;

      // Detect truncation
      if (finishReason === 'MAX_TOKENS') {
        console.warn(`[GeminiProvider] Output truncated (MAX_TOKENS). Retrying once with concise summary directive...`);
        const retryPrompt = `${prompt}\n\n[CRITICAL FORMATTING DIRECTIVE: The previous attempt exceeded length limits and was truncated. Provide a more concise, compact summary ensuring all team members are covered without repeating long descriptions.]`;
        
        response = await client.models.generateContent({
          model: activeModel,
          contents: retryPrompt,
          config: {
            systemInstruction: options?.systemInstruction,
            temperature: options?.temperature ?? 0.1,
            maxOutputTokens: maxTokens,
          },
        });

        candidate = response.candidates?.[0];
        finishReason = candidate?.finishReason;

        if (finishReason === 'MAX_TOKENS') {
          console.error(`[GeminiProvider] Retry also truncated by MAX_TOKENS.`);
          const truncErr: any = new Error('AI_RESPONSE_TRUNCATED: The generated response exceeded token limits. Please ask a more specific question.');
          truncErr.statusCode = 422;
          truncErr.code = 'AI_RESPONSE_TRUNCATED';
          throw truncErr;
        }
      }

      const text = response.text;
      if (!text || text.trim().length === 0) {
        throw new Error('Gemini returned an empty response.');
      }

      // Strip unintentional backslash escapes before Markdown control characters (\#### -> ####, \* -> *, \--- -> ---)
      const cleaned = text.trim().replace(/\\([#*\-_`~>|])/g, '$1');
      return cleaned;
    } catch (error: any) {
      const rawMessage = error?.message || '';
      const statusCode = error?.status || error?.statusCode;
      const lowerMsg = rawMessage.toLowerCase();

      console.error(`[GeminiProvider] API Error (${activeModel}):`, rawMessage);

      // Check for rate limit / quota exhaustion
      const isRateLimit = statusCode === 429 ||
                          lowerMsg.includes('429') ||
                          lowerMsg.includes('resource_exhausted') ||
                          lowerMsg.includes('quota');

      if (isRateLimit) {
        const rateLimitErr: any = new Error('The AI assistant has reached its rate limit. Please wait a moment and try again.');
        rateLimitErr.statusCode = 429;
        rateLimitErr.code = 'AI_RATE_LIMITED';
        throw rateLimitErr;
      }

      throw error;
    }
  }
}
