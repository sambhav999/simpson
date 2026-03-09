const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const routers = {
    'marketsRouter': '/markets',
    'portfolioRouter': '/portfolio',
    'tradesRouter': '/trade',
    'leaderboardRouter': '/leaderboard',
    'pointsRouter': '/points',
    'shareRouter': '/share',
    'onboardingRouter': '/onboarding',
    'metricsRouter': '/metrics',
    'authRouter': '/api/auth',
    'predictionsRouter': '/api/predictions',
    'adminRouter': '/api/admin',
    // socialRouter is mounted at /api/comments, /api/follow, /api/feed. We'll simplify this by just mapping to /api/comments as its primary and adjusting manually if needed.
    'socialRouter': '/api/comments',
    'creatorsRouter': '/api/creators',
    'cardsRouter': '/api/cards',
    'dailyRouter': '/api/daily',
    'router': '' // generic router used in many files
};

// get all controller files
const files = execSync('find src/modules -name "*.controller.ts"').toString().split('\n').filter(Boolean);

let allEndpoints = [];

files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    let prefix = '';

    // Find which router is used in this file
    for (const [routerName, pfx] of Object.entries(routers)) {
        if (content.includes(`const ${routerName} =`) || content.includes(`export const ${routerName} =`)) {
            if (routerName !== 'router') {
                prefix = pfx;
                break;
            }
        }
    }

    // Generic router fallback mapping based on folder name
    if (!prefix) {
        const folder = path.basename(path.dirname(file));
        if (folder === 'auth') prefix = '/api/auth';
        else if (folder === 'points') prefix = '/points';
        else if (folder === 'share') prefix = '/share';
        else if (folder === 'social') prefix = '/api/comments'; // default
        else if (folder === 'predictions') prefix = '/api/predictions';
        else if (folder === 'onboarding') prefix = '/onboarding';
        else if (folder === 'daily') prefix = '/api/daily';
        else if (folder === 'creators') prefix = '/api/creators';
        else if (folder === 'metrics') prefix = '/metrics';
        else if (folder === 'admin') prefix = '/api/admin';
        else if (folder === 'cards') prefix = '/api/cards';
    }

    const regex = /(?:router|[a-zA-Z]+Router)\.(get|post|put|delete|patch)\(['"]([^'"]+)['"]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        let routePath = match[2];

        // adjust socialRouter specific mounts based on content if needed (not strictly necessary if we just check usage)
        if (file.includes('social/social.controller.ts')) {
            if (routePath.includes('follow')) prefix = '/api/follow';
            else if (routePath.includes('feed')) prefix = '/api/feed';
            else prefix = '/api/comments';
        }

        if (routePath === '/') routePath = ''; // normalize
        const fullPath = `${prefix}${routePath}`;
        allEndpoints.push({ method, path: fullPath, file });
    }
});

// Now check frontend/src for usages of these endpoints
const frontendApiFile = fs.readFileSync('frontend/src/lib/api.ts', 'utf8');
const frontendFilesStr = execSync('find frontend/src -type f -name "*.ts" -o -name "*.tsx"').toString().split('\n').filter(Boolean);

let unused = [];

allEndpoints.forEach(ep => {
    // convert express path params /:id to something we can search for, or just search base path
    let basePath = ep.path.split('/:')[0];
    if (basePath === '') basePath = ep.path; // fallback

    // Search lib/api.ts
    if (frontendApiFile.includes(basePath)) {
        return; // used
    }

    // Search all frontend files as fallback
    let isUsed = false;
    for (const ffile of frontendFilesStr) {
        const fcontent = fs.readFileSync(ffile, 'utf8');
        if (fcontent.includes(basePath)) {
            isUsed = true;
            break;
        }
    }

    if (!isUsed) {
        unused.push(ep);
    }
});

console.log(`Total backend endpoints: ${allEndpoints.length}`);
console.log(`Unused endpoints: ${unused.length}`);
console.log(unused.map(u => `${u.method} ${u.path}`).join('\n'));
