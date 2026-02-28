import { Router, Request, Response } from 'express';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PrismaService } from '../../core/config/prisma.service';
import { logger } from '../../core/logger/logger';
import { AppError } from '../../core/config/error.handler';

const router = Router();
const prisma = PrismaService.getInstance();

let cachedFont: Buffer | null = null;
async function fetchFont() {
    if (cachedFont) return cachedFont;
    try {
        const res = await fetch('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZJhjp-Ek-_EeA.woff');
        const arrayBuffer = await res.arrayBuffer();
        cachedFont = Buffer.from(arrayBuffer);
        return cachedFont;
    } catch (err) {
        logger.error('Failed to fetch font', err);
        throw new Error('Failed to fetch font');
    }
}

// GET /share/:marketId/:wallet
router.get('/:marketId/:wallet', async (req: Request, res: Response, next) => {
    try {
        const { marketId, wallet } = req.params;

        const market = await prisma.market.findUnique({ where: { id: marketId } });
        if (!market) throw new AppError('Market not found', 404);

        const position = await prisma.position.findFirst({
            where: { marketId, walletAddress: wallet },
        });

        let displayAmount = position ? position.amount.toFixed(2) : '0';
        let displaySide = 'Observer';
        if (position && position.tokenMint === market.yesTokenMint) displaySide = 'YES';
        if (position && position.tokenMint === market.noTokenMint) displaySide = 'NO';

        const fontData = await fetchFont();

        const element = {
            type: 'div',
            props: {
                style: {
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    backgroundColor: '#1E1E2E',
                    color: 'white',
                    padding: '60px',
                    fontFamily: 'Inter',
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            style: { fontSize: 32, color: '#A6ACCD', marginBottom: 20 },
                            children: `SimPredict Market`,
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            style: { fontSize: 64, fontWeight: 'bold', marginBottom: 40, lineHeight: 1.2 },
                            children: market.title,
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                backgroundColor: displaySide === 'YES' ? '#10B981' : displaySide === 'NO' ? '#EF4444' : '#6B7280',
                                padding: '20px 40px',
                                borderRadius: '16px',
                                fontSize: 48,
                                fontWeight: 'bold',
                            },
                            children: position && position.amount > 0 ? `Bet ${displayAmount} on ${displaySide}` : 'Market Spectator'
                        }
                    }
                ]
            }
        };

        const svg = await satori(element as any, {
            width: 1200,
            height: 630,
            fonts: [
                {
                    name: 'Inter',
                    data: fontData,
                    weight: 400,
                    style: 'normal',
                },
            ],
        });

        const resvg = new Resvg(svg, {
            background: 'rgba(30, 30, 46, 1)',
            fitTo: { mode: 'width', value: 1200 }
        });

        const pngData = resvg.render().asPng();

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(pngData);
    } catch (err) {
        next(err);
    }
});

export { router as shareRouter };
