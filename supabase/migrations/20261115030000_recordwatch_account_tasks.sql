-- RecordWatch checklist is account-only; browser localStorage is no longer
-- a state or data source for logged-in users.
CREATE TABLE IF NOT EXISTS public.recordwatch_case_tasks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_case_id uuid NOT NULL REFERENCES public.saved_cases(id) ON DELETE CASCADE,
  task_key text NOT NULL CHECK(task_key IN (
    'courtDocketChecked','stateRepositoryChecked','certifiedDispositionRequested',
    'backgroundCheckChecked','dataBrokerChecked','disputePacketGenerated',
    'followUpNeeded','correctedVerified'
  )),
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,saved_case_id,task_key)
);
CREATE INDEX IF NOT EXISTS recordwatch_case_tasks_case_idx
 ON public.recordwatch_case_tasks(saved_case_id);
ALTER TABLE public.recordwatch_case_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recordwatch_case_tasks_owner_read ON public.recordwatch_case_tasks;
CREATE POLICY recordwatch_case_tasks_owner_read ON public.recordwatch_case_tasks
  FOR SELECT TO authenticated USING (
    user_id=(select auth.uid()) AND EXISTS(
      SELECT 1 FROM public.saved_cases sc WHERE sc.id=saved_case_id
       AND sc.user_id=(select auth.uid()) AND sc.deleted_at IS NULL
       AND sc.archived_at IS NULL
    )
  );
DROP POLICY IF EXISTS recordwatch_case_tasks_owner_write ON public.recordwatch_case_tasks;
CREATE POLICY recordwatch_case_tasks_owner_write ON public.recordwatch_case_tasks
  FOR INSERT TO authenticated WITH CHECK (
    user_id=(select auth.uid()) AND EXISTS(
      SELECT 1 FROM public.saved_cases sc WHERE sc.id=saved_case_id
       AND sc.user_id=(select auth.uid()) AND sc.deleted_at IS NULL
       AND sc.archived_at IS NULL
    )
  );
DROP POLICY IF EXISTS recordwatch_case_tasks_owner_update ON public.recordwatch_case_tasks;
CREATE POLICY recordwatch_case_tasks_owner_update ON public.recordwatch_case_tasks
  FOR UPDATE TO authenticated
  USING (user_id=(select auth.uid())) WITH CHECK (user_id=(select auth.uid()));
REVOKE ALL ON public.recordwatch_case_tasks FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.recordwatch_case_tasks TO authenticated;
GRANT ALL ON public.recordwatch_case_tasks TO service_role;
