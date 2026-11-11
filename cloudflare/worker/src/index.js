/**
 * NINAI cloud backup endpoint.
 *
 * Routes:
 *   GET  /health
 *   POST /backup/:workspaceId
 *   GET  /backup/:workspaceId/latest
 *   GET  /backup/:workspaceId/versions
 *
 * Auth: Authorization: Bearer <BACKUP_TOKEN>
 * Storage: Cloudflare R2 binding BACKUPS.
 */

const MAX_BYTES = 50 * 1024 * 1024;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors(env) });
        }

        if (url.pathname === '/health' && request.method === 'GET') {
            return json(env, { ok: true, service: 'ninai-backup', time: new Date().toISOString() });
        }

        if (!isAuthorized(request, env)) {
            return json(env, { error: 'Unauthorized' }, 401);
        }

        const latest = url.pathname.match(/^\/backup\/([^/]+)\/latest$/);
        if (latest && request.method === 'GET') {
            const id = validWorkspaceId(latest[1]);
            if (!id) return json(env, { error: 'Invalid workspace id' }, 400);
            const object = await env.BACKUPS.get(latestKey(id));
            if (!object) return json(env, { error: 'No backup found' }, 404);
            return new Response(object.body, {
                headers: {
                    ...cors(env),
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store',
                    ETag: object.httpEtag,
                },
            });
        }

        const versions = url.pathname.match(/^\/backup\/([^/]+)\/versions$/);
        if (versions && request.method === 'GET') {
            const id = validWorkspaceId(versions[1]);
            if (!id) return json(env, { error: 'Invalid workspace id' }, 400);
            const listed = await env.BACKUPS.list({ prefix: `workspaces/${id}/versions/` });
            return json(env, {
                workspaceId: id,
                versions: listed.objects.map(item => ({
                    key: item.key,
                    size: item.size,
                    uploaded: item.uploaded?.toISOString?.() || null,
                })),
            });
        }

        const backup = url.pathname.match(/^\/backup\/([^/]+)$/);
        if (backup && request.method === 'POST') {
            const id = validWorkspaceId(backup[1]);
            if (!id) return json(env, { error: 'Invalid workspace id' }, 400);

            const contentLength = Number(request.headers.get('content-length') || 0);
            if (contentLength > MAX_BYTES) return json(env, { error: 'Snapshot is too large' }, 413);
            const text = await request.text();
            if (text.length > MAX_BYTES) return json(env, { error: 'Snapshot is too large' }, 413);

            let payload;
            try {
                payload = JSON.parse(text);
            } catch {
                return json(env, { error: 'Snapshot is not valid JSON' }, 400);
            }
            if (payload?.app !== 'NINAI') {
                return json(env, { error: 'Not a NINAI workspace snapshot' }, 400);
            }

            const uploadedAt = new Date().toISOString();
            const versionId = `${uploadedAt.replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
            const versionKey = `workspaces/${id}/versions/${versionId}.json`;
            const metadata = {
                workspaceId: id,
                uploadedAt,
                versionId,
                entityCount: String(countEntities(payload)),
            };

            await Promise.all([
                env.BACKUPS.put(versionKey, text, { httpMetadata: { contentType: 'application/json' }, customMetadata: metadata }),
                env.BACKUPS.put(latestKey(id), text, { httpMetadata: { contentType: 'application/json' }, customMetadata: metadata }),
            ]);

            return json(env, {
                ok: true,
                workspaceId: id,
                versionId,
                uploadedAt,
                size: new TextEncoder().encode(text).byteLength,
            }, 201);
        }

        return json(env, { error: 'Not found' }, 404);
    },
};

function latestKey(workspaceId) {
    return `workspaces/${workspaceId}/latest.json`;
}

function validWorkspaceId(value) {
    return /^[A-Za-z0-9_-]{1,100}$/.test(value || '') ? value : null;
}

function isAuthorized(request, env) {
    const expected = env.BACKUP_TOKEN;
    if (!expected) return false;
    const header = request.headers.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    return safeEqual(token, expected);
}

function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function cors(env) {
    return {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
}

function json(env, body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...cors(env),
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    });
}

function countEntities(payload) {
    return [
        'notes', 'folders', 'leads', 'leadActivities', 'projects', 'projectMilestones',
        'tasks', 'subtasks', 'taskComments', 'calendarEvents', 'tags', 'recordTags',
        'noteLinks', 'notifications', 'activities', 'followUps',
    ].reduce((sum, key) => sum + (Array.isArray(payload?.[key]) ? payload[key].length : 0), 0);
}
