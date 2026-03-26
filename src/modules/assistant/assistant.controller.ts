import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { HomerAgent } from '../../AI_agent';
import { logger } from '../../core/logger/logger';

const router = Router();

// POST /api/assistant/chat — Custom standalone AI Assistant
router.post('/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      message: z.string().min(1).max(500),
    });
    const { message } = schema.parse(req.body);

    logger.info(`AI Assistant query: "${message}"`);
    const answer = await HomerAgent.answer(message);

    res.json({
      status: 'success',
      data: {
        answer,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    next(err);
  }
});

export { router as assistantRouter };
