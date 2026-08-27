-- Phase 29: security hardening for the Copilot action audit surface.

revoke all on table public.copilot_action_audit
from anon, authenticated;

revoke all on sequence public.copilot_action_audit_id_seq
from anon, authenticated;


-- Audit records are append-only from the application point of view.
-- The trusted service role used by the Edge Function remains able to write.

alter table public.copilot_action_audit
  drop constraint if exists copilot_action_audit_error_length_check;

alter table public.copilot_action_audit
  add constraint copilot_action_audit_error_length_check
  check (error is null or length(error) <= 4000);

alter table public.copilot_action_audit
  drop constraint if exists copilot_action_audit_result_metadata_size_check;

alter table public.copilot_action_audit
  add constraint copilot_action_audit_result_metadata_size_check
  check (
    result_metadata is null
    or pg_column_size(result_metadata) <= 16384
  );
