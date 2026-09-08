import { Request, Response, NextFunction } from 'express';
import { assistantService, AssistantProviderUnavailableError } from '../services/ai/assistantService';

export class AssistantController {
  async query(req: Request, res: Response, next: NextFunction) {
    try {
      const { question } = req.body;

      if (!question || typeof question !== 'string' || question.trim().length === 0) {
        return res.status(400).json({ error: 'A valid question string is required.' });
      }

      if (question.trim().length > 500) {
        return res.status(400).json({ error: 'Question is too long (maximum 500 characters).' });
      }

      const managerUserId = req.user!.id;
      const result = await assistantService.processQuery(managerUserId, question.trim());

      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof AssistantProviderUnavailableError || error?.statusCode === 503 || error?.statusCode === 429) {
        const statusCode = error?.statusCode || 503;
        const code = error?.code || (statusCode === 429 ? 'AI_RATE_LIMITED' : 'AI_PROVIDER_UNAVAILABLE');
        const message = error?.message || 'The AI report assistant is temporarily unavailable. Please try again later.';

        return res.status(statusCode).json({
          message,
          code,
        });
      }
      next(error);
    }
  }
}

export const assistantController = new AssistantController();
