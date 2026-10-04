-- Bind the question text to the requestId at insertion time.
-- A retry that supplies a different question is rejected before any model call.
ALTER TABLE queries ADD COLUMN question_digest TEXT NOT NULL DEFAULT '';
