import request from 'supertest';
import { buildApp } from '../../src/app';
import { PrismaService } from '../../src/core/config/prisma.service';
import { SolanaService } from '../../src/modules/solana/solana.service';

const app = buildApp();
const prisma = PrismaService.getInstance();

// Mock DFlow Service
jest.mock('../../src/modules/dflow/dflow.service', () => {
    return {
        DFlowService: jest.fn().mockImplementation(() => {
            return {
                getTradeQuote: jest.fn().mockResolvedValue({
                    serializedTransaction: 'mock-base64-transaction==',
                    expectedPrice: 0.5,
                    priceImpact: 0.01,
                    fee: 0,
                    expiresAt: Date.now() + 60000,
                }),
            };
        }),
    };
});

describe('Trade Flow (e2e)', () => {
    const testWallet = '4N1v35Z6MZaA7P7b21E2C8Z8E4zM8pG3W7H3zR4b3N2w'; // Valid looking pubkey
    const tokenMintYes = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    const tokenMintNo = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
    let marketId: string;

    beforeAll(async () => {
        // Start DB
        await prisma.$connect();

        // Seed a dummy market
        const market = await prisma.market.create({
            data: {
                title: 'Will BTC hit 100k?',
                yesTokenMint: tokenMintYes,
                noTokenMint: tokenMintNo,
                status: 'active',
                category: 'crypto'
            }
        });
        marketId = market.id;
    });

    afterAll(async () => {
        // Clean up
        await prisma.market.delete({ where: { id: marketId } });
        await prisma.$disconnect();
    });

    it('/trade/quote (POST) - should return an error if amount is missing', async () => {
        const response = await request(app).post('/trade/quote').send({
            wallet: testWallet,
            marketId,
            side: 'YES',
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('amount must be a positive number');
    });

    it('/trade/quote (POST) - should return an error if wallet is invalid', async () => {
        const response = await request(app).post('/trade/quote').send({
            wallet: 'invalid_wallet',
            marketId,
            side: 'YES',
            amount: 10,
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid wallet address');
    });

    it('/trade/quote (POST) - should fetch quote for valid payload', async () => {
        const response = await request(app).post('/trade/quote').send({
            wallet: testWallet,
            marketId,
            side: 'YES',
            amount: 10,
        });

        expect(response.status).toBe(200);
        expect(response.body.data.marketId).toBe(marketId);
        expect(response.body.data.serializedTransaction).toBe('mock-base64-transaction==');
        expect(response.body.data.expectedPrice).toBe(0.5);
        expect(response.body.data.side).toBe('YES');
        expect(response.body.data.tokenMint).toBe(tokenMintYes);
    });
});
