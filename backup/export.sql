-- Daily auto-backup: one JSON document in the same format as the app's export, so the app can import it.
-- Runs as backup_reader, which may only read these columns.
select json_build_object(
  'exported_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'source', 'auto-backup',
  'workouts', coalesce(
    json_agg(json_build_object('person', person, 'activity', activity, 'minutes', minutes, 'calories', calories, 'date', workout_date) order by workout_date, created_at),
    '[]'::json
  )
)
from public.workouts;
