// Hermetic fixture API for the web e2e suite.
//
// Serves GET /shares/{code} from the JSON fixtures in e2e/fixtures/, where the
// FILENAME IS THE SHARE CODE (e2etest1.json → /shares/e2etest1). Every fixture
// is validated at startup against the real shared contract
// (ShareResolveResponseSchema) AND the reconstruction invariant, so e2e
// fixtures can never drift from what the production API is allowed to return.
//
// The Next.js server under test points AYA_API_BASE_URL here, which keeps the
// whole e2e run offline: no deployed backend, no DynamoDB, no LLM calls.

import http from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShareResolveResponseSchema, checkReconstruction } from '@aya/shared';

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PORT = Number(process.env.STUB_PORT ?? 4545);

function loadFixtures() {
  const shares = new Map();
  for (const file of readdirSync(FIXTURES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const code = path.basename(file, '.json');
    const raw = JSON.parse(readFileSync(path.join(FIXTURES_DIR, file), 'utf8'));
    const analyzedPage = ShareResolveResponseSchema.parse(raw);
    const check = checkReconstruction(analyzedPage.page.fullText, analyzedPage.phrases);
    if (!check.ok) {
      throw new Error(`Fixture ${file} violates the reconstruction invariant: ${check.reason}`);
    }
    shares.set(code, analyzedPage);
  }
  if (shares.size === 0) {
    throw new Error(`No .json fixtures found in ${FIXTURES_DIR}`);
  }
  return shares;
}

const shares = loadFixtures();

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok', version: 'e2e-stub' });
  }

  const shareMatch = url.pathname.match(/^\/shares\/([^/]+)$/);
  if (req.method === 'GET' && shareMatch) {
    const code = decodeURIComponent(shareMatch[1]);
    const analyzedPage = shares.get(code);
    if (analyzedPage) {
      return sendJson(res, 200, analyzedPage);
    }
    return sendJson(res, 404, {
      error: {
        code: 'share_not_found',
        message: `No share with code "${code}".`,
      },
    });
  }

  return sendJson(res, 404, {
    error: {
      code: 'validation_error',
      message: `The e2e stub does not handle: ${req.method} ${url.pathname}`,
    },
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `[e2e-stub] ${shares.size} fixture share(s) on http://127.0.0.1:${PORT} ` +
      `(codes: ${[...shares.keys()].join(', ')})`,
  );
});
