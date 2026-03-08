# SimPredict Backend API Endpoints

This document outlines all the available API endpoints in the SimPredict backend, categorized by their respective modules.

## Markets (`/markets`)
- `GET /markets/`
- `GET /markets/featured`
- `GET /markets/:id`

## Portfolio (`/portfolio`)
- `GET /portfolio/:wallet`
- `GET /portfolio/:wallet/history`

## Trades (`/trade`)
- `POST /trade/quote`
- `GET /trade/pay`
- `POST /trade/pay`
- `GET /trade/verify`

## Leaderboard (`/leaderboard`)
- `GET /leaderboard/`
- `GET /leaderboard/xp`
- `GET /leaderboard/accuracy`
- `GET /leaderboard/creators`

## Points (`/points`)
- `GET /points/:wallet`

## Share (`/share`)
- `GET /share/:marketId/:wallet`

## Onboarding (`/onboarding`)
- `POST /onboarding/step1-auth`
- `POST /onboarding/step2-profile`
- `POST /onboarding/step3-faucet`

## Metrics (`/metrics`)
- `GET /metrics/`

---

### New V1 API Endpoints

## Auth (`/api/auth`)
- `POST /api/auth/nonce`
- `POST /api/auth/verify`

## Predictions (`/api/predictions`)
- `GET /api/predictions/ai`
- `POST /api/predictions/track`
- `GET /api/predictions/user/:userId`

## Admin (`/api/admin`)
- `GET /api/admin/markets/unfeatured`
- `POST /api/admin/predictions`
- `POST /api/admin/daily/create`
- `POST /api/admin/daily/:id/resolve`

## Social (`/api/comments`, `/api/follow`, `/api/feed`)
*Note: Due to routing configuration in `app.ts`, these endpoints might be accessible under `/api/comments`, `/api/follow`, or `/api/feed`.*
- `POST /` (Create comment)
- `GET /market/:marketId` (Get market comments)
- `POST /:id/upvote` (Upvote comment)
- `POST /follow` (Follow user)
- `DELETE /follow/:userId` (Unfollow user)
- `GET /feed` (Get user feed)

## Creators (`/api/creators`)
- `POST /api/creators/host`
- `GET /api/creators/:id`
- `GET /api/creators/:id/markets`
- `GET /api/creators/:id/stats`

## Cards (`/api/cards`)
- `POST /api/cards/generate`
- `GET /api/cards/r/:trackingId`

## Daily (`/api/daily`)
- `GET /api/daily/`
- `POST /api/daily/predict`
- `GET /api/daily/scoreboard`
- `GET /api/daily/user/stats`
- `GET /api/daily/leaderboard`
