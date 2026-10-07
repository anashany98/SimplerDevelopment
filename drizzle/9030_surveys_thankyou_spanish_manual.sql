-- Translate the survey thank-you defaults for rows created before 0005.
--
-- Only rows whose copy still equals the OLD English default are touched, so a
-- client's customised thank-you text is never overwritten. Safe to re-run.
-- Mirrors drizzle/0005_handy_taskmaster.sql (the schema-default flip) for
-- existing data; hand-written because drizzle-kit only emits DDL.
--
-- Apply against metro by hand after the 0005 deploy (prod migrations are
-- journaled; data backfills are not).

UPDATE "surveys"
SET "thank_you_title" = '¡Gracias!'
WHERE "thank_you_title" = 'Thank you!';

UPDATE "surveys"
SET "thank_you_message" = 'Tu respuesta se ha registrado.'
WHERE "thank_you_message" = 'Your response has been recorded.';
