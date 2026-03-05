import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PrismaService } from '../../core/config/prisma.service';
import { requireAuth } from '../../core/config/auth.middleware';
import { AppError } from '../../core/config/error.handler';
import { logger } from '../../core/logger/logger';
import { config } from '../../core/config/config';

const router = Router();
const prisma = PrismaService.getInstance();

let cachedFont: Buffer | null = null;
async function fetchFont() {
    if (cachedFont) return cachedFont;
    const res = await fetch('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZJhjp-Ek-_EeA.woff');
    cachedFont = Buffer.from(await res.arrayBuffer());
    return cachedFont;
}

function getRankBadge(xpTotal: number): string {
    if (xpTotal >= 50001) return 'Legendary Baba';
    if (xpTotal >= 10001) return 'Grand Oracle';
    if (xpTotal >= 2001) return 'Oracle Prophet';
    if (xpTotal >= 501) return 'Market Caller';
    if (xpTotal >= 101) return 'Degen Prophet';
    return 'Apprentice Prophet';
}

type TemplateType = 'prediction' | 'win' | 'loss' | 'streak';

function getTemplateColors(template: TemplateType): { start: string; end: string } {
    switch (template) {
        case 'prediction': return { start: '#7C3AED', end: '#2563EB' };
        case 'win': return { start: '#F59E0B', end: '#EF4444' };
        case 'loss': return { start: '#EF4444', end: '#6B7280' };
        case 'streak': return { start: '#EC4899', end: '#8B5CF6' };
    }
}

function getTemplateTitle(template: TemplateType): string {
    switch (template) {
        case 'prediction': return '🔮 PREDICTION FLEX';
        case 'win': return '✅ CALLED IT';
        case 'loss': return '❌ NGMI (for now)';
        case 'streak': return '🔥 STREAK';
    }
}

// POST /api/cards/generate — Generate shareable meme card
router.post('/generate', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const schema = z.object({
            market_id: z.string(),
            template: z.enum(['prediction', 'win', 'loss', 'streak']),
        });
        const { market_id, template } = schema.parse(req.body);
        const wallet = req.user!.wallet;

        const [market, user, position] = await Promise.all([
            prisma.market.findUnique({ where: { id: market_id } }),
            prisma.user.findUnique({ where: { walletAddress: wallet } }),
            prisma.position.findFirst({ where: { walletAddress: wallet, marketId: market_id } }),
        ]);

        if (!market) throw new AppError('Market not found', 404);
        if (!user) throw new AppError('User not found', 404);

        const trackingId = crypto.randomBytes(8).toString('hex').slice(0, 16);
        const colors = getTemplateColors(template);
        const fontData = await fetchFont();

        const side = position?.side || 'Observer';
        const username = user.username || wallet.slice(0, 8);
        const rank = getRankBadge(user.xpTotal);

        // Build satori element
        const element = {
            type: 'div',
            props: {
                style: {
                    height: '100%', width: '100%', display: 'flex', flexDirection: 'column',
                    justifyContent: 'space-between', padding: '60px', fontFamily: 'Inter',
                    background: `linear-gradient(135deg, ${colors.start}, ${colors.end})`, color: 'white',
                },
                children: [
                    { type: 'div', props: { style: { fontSize: 28, opacity: 0.8 }, children: 'SIMPREDICTS.COM' } },
                    { type: 'div', props: { style: { fontSize: 40, fontWeight: 'bold', marginTop: 10 }, children: getTemplateTitle(template) } },
                    { type: 'div', props: { style: { fontSize: 36, fontWeight: 'bold', marginTop: 20, lineHeight: 1.3 }, children: market.title } },
                    { type: 'div', props: { style: { display: 'flex', marginTop: 20, fontSize: 28, backgroundColor: 'rgba(0,0,0,0.3)', padding: '12px 24px', borderRadius: 12 }, children: `I predict: ${side}` } },
                    { type: 'div', props: { style: { fontSize: 22, marginTop: 'auto', opacity: 0.7 }, children: `@${username} • ${rank}` } },
                ],
            },
        };

        const svg = await satori(element as any, {
            width: 1200, height: 630,
            fonts: [{ name: 'Inter', data: fontData, weight: 400, style: 'normal' as const }],
        });

        const resvg = new Resvg(svg, { fitTo: { mode: 'width' as const, value: 1200 } });
        const pngBuffer = resvg.render().asPng();

        // For V1: store as base64 data URL (R2 integration later)
        const imageUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

        // Create meme card record
        const card = await prisma.memeCard.create({
            data: {
                userId: wallet,
                marketId: market_id,
                template,
                imageUrl,
                trackingId,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            },
        });

        // Award +20 XP
        await prisma.$transaction([
            prisma.xPTransaction.create({
                data: { walletAddress: wallet, amount: 20, reason: 'meme_card_generated', metadata: { card_id: card.id } },
            }),
            prisma.user.update({
                where: { walletAddress: wallet },
                data: { xpTotal: { increment: 20 } },
            }),
        ]);

        const shareUrl = `${config.APP_URL}/r/${trackingId}`;
        const shareText = `Just called ${market.title} on @simp_predicts 🔮\n\nPrediction: ${side}\n\nPredict with me: ${shareUrl}`;

        res.status(201).json({
            card_id: card.id,
            image_url: imageUrl,
            tracking_id: trackingId,
            share_url: shareUrl,
            share_text: shareText,
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/r/:trackingId — Redirect for share tracking
router.get('/r/:trackingId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const card = await prisma.memeCard.findUnique({
            where: { trackingId: req.params.trackingId },
        });
        if (!card) throw new AppError('Card not found', 404);

        // Increment clicks
        await prisma.memeCard.update({
            where: { id: card.id },
            data: { clicks: { increment: 1 } },
        });

        // Redirect to market
        res.redirect(302, `${config.APP_URL}/market/${card.marketId}`);
    } catch (err) {
        next(err);
    }
});

export { router as cardsRouter };
