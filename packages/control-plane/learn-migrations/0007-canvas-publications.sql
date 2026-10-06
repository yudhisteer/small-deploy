-- Explore publication (docs/features/explore-publish.md): a canvas is discoverable in Explore only while it has a row
-- here, written by its owner's explicit Publish to Explore and removed by Remove from Explore. No row = not
-- discoverable: a new canvas is private, and a share link stays unlisted - learn_boards.shared, view_token and
-- public_view are link access, never discoverability. No backfill (owner, 2026-10-06): every existing share stays
-- unlisted. Discoverability only: no content, Tutor state, evidence, share or repository permission lives here.
-- Additive and re-runnable; LEARN_DB only. Applied locally only until an explicit deploy GO (order 0004..0007).
CREATE TABLE IF NOT EXISTS canvas_publications (
  org TEXT NOT NULL,
  canvas TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org, canvas)
);
