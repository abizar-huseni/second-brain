-- Your situation as real fields, so daily checks don't depend on the AI spotting it in "About me":
-- course end, dissertation due, Student visa expiry and the Graduate visa plan. Filled in on the You page
-- (with best guesses you confirm), never in this repo. Applied automatically on deploy. Safe to re-run.

alter table profile add column if not exists course_end        date;
alter table profile add column if not exists dissertation_due  date;
alter table profile add column if not exists visa_type         text not null default 'student';   -- student | graduate | other
alter table profile add column if not exists visa_expiry       date;
alter table profile add column if not exists grad_plan         text not null default 'unsure';    -- apply | unsure | no
alter table profile add column if not exists term_work_limit   int  not null default 20;          -- hours a week in term time (degree level)
alter table profile add column if not exists situation_confirmed_at timestamptz;

-- The assistant's default name is now Kairos. "Brain" was only ever the old default, so it moves too.
alter table profile alter column assistant_name set default 'Kairos';
update profile set assistant_name = 'Kairos' where assistant_name = 'Brain';

-- Job-hunting emails are no longer a category of their own.
update inbox set category = 'other' where category = 'jobs';
