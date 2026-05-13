import { createServer } from 'node:http';
import { constants } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function readEnvFile() {
  try {
    const envText = await readFile(resolve(projectRoot, '.env'), 'utf8');
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim();
      if (key && process.env[key] === undefined) {
        process.env[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // The process environment can provide the same values in production.
  }
}

await readEnvFile();

const host = process.env.CONTENT_API_HOST ?? '127.0.0.1';
const port = Number(process.env.CONTENT_API_PORT ?? 8787);
const editorToken = process.env.EDITOR_TOKEN;
const contentFile = resolve(
  projectRoot,
  process.env.CONTENT_FILE ?? 'content/site-content.json',
);

if (!editorToken) {
  throw new Error('EDITOR_TOKEN is required in .env or the process environment.');
}

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJsonContent() {
  if (!(await fileExists(contentFile))) {
    return {};
  }

  return JSON.parse(await readFile(contentFile, 'utf8'));
}

async function writeJsonContent(content) {
  await mkdir(dirname(contentFile), { recursive: true });

  if (await fileExists(contentFile)) {
    await copyFile(contentFile, `${contentFile}.bak`);
  }

  const tmpFile = `${contentFile}.${Date.now()}.tmp`;
  await writeFile(tmpFile, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  await rename(tmpFile, contentFile);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

function readRequestBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy(new Error('Request body is too large.'));
      }
    });
    request.on('end', () => resolveBody(body));
    request.on('error', rejectBody);
  });
}

function isAuthorized(request) {
  return request.headers.authorization === `Bearer ${editorToken}`;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/site-content') {
      sendJson(response, 200, await readJsonContent());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/site-content') {
      if (!isAuthorized(request)) {
        sendJson(response, 401, { error: 'Invalid editor token.' });
        return;
      }

      const body = await readRequestBody(request);
      const content = JSON.parse(body);

      if (!content || typeof content !== 'object' || Array.isArray(content)) {
        sendJson(response, 400, { error: 'Expected a JSON object.' });
        return;
      }

      await writeJsonContent(content);
      sendJson(response, 200, { ok: true, content });
      return;
    }

    sendJson(response, 404, { error: 'Not found.' });
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Internal server error.',
    });
  }
});

server.listen(port, host, () => {
  console.log(`site content API listening on http://${host}:${port}`);
});
