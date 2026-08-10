/*
 * Cloudflare Worker: сохраняет правки из админ-панели (admin.html) прямо
 * в index.html репозитория через GitHub API. Использует HTMLRewriter —
 * это встроенный в Cloudflare Workers потоковый HTML-парсер, он находит
 * элементы по [data-cms-id] и безопасно меняет их текст, не ломая разметку
 * (в отличие от regex-замены по тексту).
 *
 * Секреты (Settings -> Variables and Secrets), см. CMS_SETUP.md:
 *   ADMIN_PASSWORD — пароль для входа в панель
 *   GITHUB_TOKEN   — fine-grained PAT с правом Contents: Read and write
 *                    только на этот репозиторий
 *
 * Обычные (не секретные) переменные:
 *   GITHUB_OWNER  — funrw1234-del
 *   GITHUB_REPO   — lanmei-test
 *   GITHUB_BRANCH — main
 */

const ALLOWED_ORIGINS = [
  'https://funrw1234-del.github.io',
  'http://localhost:5173' // для локальной проверки панели
];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function b64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUtf8(str) {
  return decodeURIComponent(escape(atob(str)));
}

async function githubGetFile(env) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/index.html?ref=${env.GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'lanmei-cms-worker'
    }
  });
  if (!res.ok) throw new Error('GitHub GET failed: ' + res.status + ' ' + (await res.text()));
  const data = await res.json();
  return { html: b64DecodeUtf8(data.content.replace(/\n/g, '')), sha: data.sha };
}

async function githubPutFile(env, html, sha, message) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/index.html`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'lanmei-cms-worker'
    },
    body: JSON.stringify({
      message: message || 'CMS: правка текста через админ-панель',
      content: b64EncodeUtf8(html),
      sha,
      branch: env.GITHUB_BRANCH
    })
  });
  if (!res.ok) throw new Error('GitHub PUT failed: ' + res.status + ' ' + (await res.text()));
  return res.json();
}

// применяет { "facts.card1.label": "новый текст", ... } к HTML через HTMLRewriter
function applyEdits(html, edits) {
  class TextSetter {
    constructor(newText) { this.newText = newText; }
    element(el) { el.setInnerContent(this.newText, { html: false }); }
  }
  let rewriter = new HTMLRewriter();
  for (const [id, text] of Object.entries(edits)) {
    // экранируем кавычки в атрибуте селектора
    const safeId = id.replace(/"/g, '\\"');
    rewriter = rewriter.on(`[data-cms-id="${safeId}"]`, new TextSetter(text));
  }
  const response = rewriter.transform(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  return response.text();
}

// собирает список { id, text } всех [data-cms-id] элементов — для GET (чтение полей панелью)
function extractFields(html) {
  const fields = [];
  class Collector {
    element(el) {
      const id = el.getAttribute('data-cms-id');
      const current = { id, text: '' };
      fields.push(current);
      // копим текстовые чанки до закрытия тега
      this._current = current;
    }
    text(chunk) {
      if (this._current) this._current.text += chunk.text;
    }
  }
  const collector = new Collector();
  const rewriter = new HTMLRewriter().on('[data-cms-id]', collector);
  return rewriter.transform(new Response(html)).text().then(() => fields);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { headers });

    if (request.method === 'GET') {
      // отдаёт текущие значения всех редактируемых полей — панель строит форму
      try {
        const { html } = await githubGetFile(env);
        const fields = await extractFields(html);
        return new Response(JSON.stringify({ ok: true, fields }), {
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Bad JSON' }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    if (!body.password || body.password !== env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ ok: false, error: 'Неверный пароль' }), {
        status: 401, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const edits = body.edits || {};
    if (!Object.keys(edits).length) {
      return new Response(JSON.stringify({ ok: false, error: 'Нет изменений' }), {
        status: 400, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    try {
      const { html, sha } = await githubGetFile(env);
      const newHtml = await applyEdits(html, edits);
      const fieldsChanged = Object.keys(edits).length;
      await githubPutFile(env, newHtml, sha, `CMS: правка ${fieldsChanged} поле(й) через админ-панель`);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: String(err) }), {
        status: 500, headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
  }
};
