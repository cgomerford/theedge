-- Referral report: run in the Supabase SQL editor whenever you want it. Read-only.
-- signups = people who paid through checkout with that code; active_pro = those whose Pro is on right now.
select referral_code, count(*) as signups, count(*) filter (where is_pro) as active_pro
from subscribers where referral_code is not null group by 1 order by 2 desc;
