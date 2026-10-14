-- Read-only setup state check. Run this after an interrupted setup query.
select case
  when to_regclass('public.workspaces') is not null then
    'RESUME: run moneyyap-resume-after-function-name-fix.sql once'
  when to_regclass('public.households') is not null then
    'FRESH: rerun the updated moneyyap-fresh-project-setup.sql once'
  else
    'FRESH: run the updated moneyyap-fresh-project-setup.sql once'
end as next_step;
