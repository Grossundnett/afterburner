-- Afterburner 0009 — Business trips → Life & Entertainment.
--
-- "Business trips" was auto-created by the Wallet-CSV importer and landed
-- in Others (the importer's default for unknown labels). A team outing is
-- entertainment, not an uncategorised leftover, so this moves it.
--
-- Note: Business trips isn't in the seed function — only existing users
-- who have imported CSVs will have a row for it. The update is a no-op
-- for anyone who doesn't.

update public.spend_categories
   set "group" = 'Life & Entertainment', subgroup = null
 where key = 'Business trips';
