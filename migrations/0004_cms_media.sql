-- buscaDR · Migración 0004: CMS Maestro (borrador/publicado con versiones) e imágenes en D1.
-- Mismo modelo que los CMS de YANK y TULL. Cada imagen o fuente se guarda en trozos base64 (≤ 700 000
-- caracteres) para respetar el límite de 2 MB por fila de D1; con el binding R2 MEDIA se usa R2.
CREATE TABLE IF NOT EXISTS cms_site(id TEXT PRIMARY KEY, draft_json TEXT NOT NULL, published_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated_by TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cms_versions(id INTEGER PRIMARY KEY AUTOINCREMENT, site_id TEXT NOT NULL, version INTEGER NOT NULL, config_json TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_cms_versions_site ON cms_versions(site_id, version);
CREATE TABLE IF NOT EXISTS cms_audit(id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cms_user_access(user_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS cms_review_flags(review_id INTEGER PRIMARY KEY, hidden INTEGER NOT NULL DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cms_media(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, key TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', width INTEGER, height INTEGER, storage TEXT NOT NULL DEFAULT 'd1', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS media_chunks(key TEXT NOT NULL, idx INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(key, idx));
CREATE TABLE IF NOT EXISTS media_objects(key TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes INTEGER NOT NULL, chunks INTEGER NOT NULL, storage TEXT NOT NULL DEFAULT 'd1' CHECK(storage IN ('d1','r2')), owner_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
