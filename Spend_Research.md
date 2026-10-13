# A Spending Tracker That Changes Behaviour: Research Brief for a Bengaluru Engineer

Build him a weekly-allowance app, not a dashboard. Make "₹X left this week" the only big number, fund it from a weekly transfer into his Apex account, keep manual logging but cut it to three taps, and put targeted friction on two leaks: late-night subscriptions and bike taxis. The strongest evidence behind this is partitioning (splitting money into smaller labelled pots), the "rehearsal" effect of writing spends down, and studies showing that easier access to your own spending data cuts discretionary spending, most of all in the evening.

## TL;DR
- **Method:** keep his mother's weighted weekly allowance (80% early in the month, 120% later) and the pay-yourself-first sweep. Turn the allowance into a real partition by moving each week's money from BOB into Apex. Skip 50/30/20 and full zero-based budgeting. Partitioning has the best evidence. In Soman and Cheema's Indian field experiment (*Journal of Marketing Research*, 2011), splitting earmarked money into two envelopes raised savings from ₹241 to ₹414.
- **Home screen:** one hero number, "₹ left this week". It should be the *lower* of what the budget allows and what is actually in his accounts. Below it: a per-day figure, a short list of categories sorted by overspend (with bars that overflow past 100%), and one plain-English instruction. No charts on the first screen.
- **Friction:** a 48-hour waitlist for anything non-essential over ₹1,500. A night-mode check-in from 22:00 to 06:00. A "late tax" envelope with an if-then plan for bike taxis. Payment-side locks on app-store purchases. Leave out bank sync, SMS parsing, Account Aggregator integration, net worth, and AI insights.

## Key Findings

1. **Seeing your money more easily reduces spending, mostly at night.** Levi and Benartzi (*Journal of Finance*, published online 30 September 2026) used the staggered release of a finance app across iPhone, iPad and Android to estimate causal effects. People who installed the mobile app cut discretionary spending. The drop was larger in the evening and among people with weaker self-control.\[1\] Benartzi has described the average fall in monthly spending as 15.7%, almost all of it discretionary (dining out and similar).\[2\] He is a known figure, but this number comes from his own newsletter rather than the paper, and the sample was people who chose to adopt the app.
2. **Writing a spend down makes the next one less likely.** Soman (2001, *Journal of Consumer Research*) found that past payments "strongly reduce purchase intention when the payment mechanism requires the consumer to write down the amount paid (rehearsal)" and when money leaves immediately.\[3\] This is the best mechanism-level reason to keep manual entry. Zhang (2023, American Council on Consumer Interests) found expense tracking linked to a smaller share of discretionary spending. Automated tracking was "linked to lower attention and less financial self-awareness", while manual recording was linked to higher self-awareness.\[4\] That result is correlational. The "manual trackers spend 15–20% less" figures on app blogs have no traceable source; ignore them.\[5\]\[6\]
3. **Partitioning works.** Cheema and Soman found that splitting a resource into separate pots slows consumption. Cheema reported that partitioning "can reduce spending by 50 percent".\[7\] In Soman and Cheema's Indian field study (*Journal of Marketing Research*, 2011), workers who got their earmarked savings in two envelopes saved an average of ₹414, 72% more than the ₹241 saved by those with one envelope. A weekly allowance kept in a separate account is a partition.
4. **Spending bunches up right after payday.** Shapiro (2005) found that calorie intake among food-stamp households "declines by 10 to 15 percent over the food stamp month", a sign of strong preference for consuming now.\[8\]\[9\] His own data shows the same pattern: ₹20,000 gone by the 12th. The 80/120 weighting is a sensible correction because it hands out less money in exactly the days when he is most likely to overspend.
5. **UPI weakens the pain of paying.** In an IIIT Delhi survey of 276 users (Dev, Gupta, Dharmavaram and Kumar, CHI EA '24), "approximately 75% of participants reported increased spending due to UPI", and many put this down to UPI's intangibility, which "reduced feelings of guilt". This is self-reported, but it fits the cash-versus-card literature (Soman; Prelec and Loewenstein; Prelec and Simester).\[10\]\[11\]
6. **If-then plans are the best-evidenced habit tool.** Gollwitzer and Sheeran's 2006 meta-analysis of 94 tests found d = 0.65. Sheeran, Listrom and Gollwitzer's 2024 update (*European Review of Social Psychology*) covered 642 independent tests and found implementation intentions worked for cognitive, affective and behavioural outcomes (d = 0.27–0.66). They suit a discrete, recurring trigger like "I woke up late".
7. **Visible progress toward a goal is what motivates.** Gargano and Rossi (*Journal of Finance*, 2024) found that users saved an extra €345 a year on average once they set goals, against €345 a year beforehand. Goal-setting doubled their savings. 57% of users named monitoring their progress as the most motivating part.

## Research Area 1: Budgeting Methods

| Method | Evidence | Fit for an impulsive overspender who gets overwhelmed |
|---|---|---|
| **Envelope (physical/digital)** | Strong for the underlying mechanism (partitioning: Cheema & Soman 2008; Soman & Cheema 2011 field RCT in India)\[12\]\[13\] | **High**, if there are only a few envelopes. Every extra envelope adds a decision |
| **Zero-based / YNAB** ("give every dollar a job", plus rules like "roll with the punches" and "age your money") | Mostly testimonials. No controlled studies found | **Medium-low.** The philosophy is useful, but the full system means many category decisions every month, which is what triggers his procrastination. Borrow one feature: covering overspending by moving money |
| **Pay yourself first** | Strong for automation. Thaler & Benartzi's Save More Tomorrow (*Journal of Political Economy*, 2004) raised participants' savings from 3.5% of income to 13.6% by the fourth pay raise, about 40 months. The US Department of Labor's CLEAR review rates the causal evidence low because people chose whether to join | **Already working.** Keep the ₹55,000 + ₹10,000 sweep automatic on payday |
| **50/30/20** | A rule of thumb with no behavioural evidence | **Low.** He already invests 55% of take-home, so the split says nothing useful about his leaks |
| **Weekly allowance** | Indirect support: partitioning, plus payday spending bunching (Shapiro). PNAS work suggests familiar periods (weekly, monthly) beat unfamiliar ones (daily, yearly)\[14\] | **High.** A shorter feedback loop, and a week lost to overspending can be recovered from |
| **Safe-to-spend number** (Simple, Copilot) | Popular, but no outcome studies. American Banker notes that any inaccuracy destroys trust in the number\[15\] | **High as a display.** It answers "okay, what do I do?" It only works if the number is trustworthy, which manual logging plus account balances can give |
| **Cash stuffing** | Highest pain of paying (Soman 2001)\[16\] | **Low in practice.** Bengaluru runs on UPI and bike taxis are paid digitally |
| **Separate spending account** | Physical partitioning plus less transparency of the rest of his money | **Very high.** He already has Apex. Make it hold only this week's money |

**Weekly vs monthly:** There is no head-to-head trial of weekly versus monthly personal budgets. The case for weekly is inferred from three things: shorter frames produce lower, more confident budget estimates (Ülkümen, Thomas and Morwitz, 2008);\[17\]\[18\] partitioning slows consumption; and spending clusters right after payday. Treat weekly as well-reasoned rather than proven. The design answer is weekly execution inside a monthly cap.

**Why methods fail for impulsive spenders:** complexity (too many categories), no recovery path (one bad week makes the month feel lost, so people quit), numbers they don't trust, and display without a decision. His own complaint ("okay, what do I do?") is the last of these.

## Research Area 2: Behavioural Science Applied to His Leaks

**Atomic Habits inversions (Clear's four laws: make it obvious, attractive, easy, satisfying):**
- *Make it invisible:* remove saved cards from Google Play and the App Store, log out of dating apps at night, and move dating apps off the home screen.
- *Make it unattractive:* show every subscription as an annual cost ("₹3,758 in 12 days ≈ ₹1.1 lakh/year at this rate") and file it under his own label, such as "late-night buys".
- *Make it difficult:* require authentication for every Play purchase, lower the UPI per-transaction limit in the bank app, use phone downtime for dating apps after 23:00, and add a 48-hour waitlist inside the tracker.
- *Make it unsatisfying:* each impulse spend visibly shrinks "left this week" straight away, and he has to tag it with an emotion ("bored / lonely / punishing myself").

**Pain of paying and mental accounting:** UPI and stored cards decouple paying from consuming (Prelec and Loewenstein's coupling idea; Soman's transparency work). Logging the spend immediately puts some of the coupling back. Mental accounting (Thaler, 1985) is something to use rather than fight: labelled pots like "Fun" and "Late tax" get treated as non-fungible, which is exactly what you want here.

**Cooling-off periods:** A University of Michigan CHI study by Moser, Schoenebeck and Resnick (2019) surveyed 151 online impulse buyers. They wanted tools for postponement and spending limits, and reported success with strategies like "waiting one day to purchase".\[19\] Specific claims such as "a 24-hour rule cuts impulse buying 64%" (attributed to NIMHANS on an Airtel blog) or "half of impulse purchases disappear" are unverified.\[20\]\[21\] Present waiting rules as plausible, low-cost and backed by self-reports, not as quantified.

**Implementation intentions:** Write them into the app as concrete if-then plans. For bike taxis: "If I'm not out of bed by 8:15, then I book the metro/bus route and message my lead that I'm 15 min late." The plan prices lateness against the ride, which is better than pretending the ride never happens.

**Feedback frequency:** The Levi and Benartzi evening effect matches his late-night pattern.\[22\] Feedback is most useful at the moment of decision, so the evening check-in should arrive before the 23:00–01:00 danger window.

**Subscription creep:** Rocket Money's core value is detecting recurring charges and showing them in one list. Users praise discovery and complain about cancellation, including cancelling Rocket Money itself.\[23\]\[24\]\[25\]\[26\]\[27\] His subscriptions are impulse buys rather than forgotten ones, so the intervention belongs before purchase (friction) and at renewal (a reminder three days before each renewal).

## Research Area 3: What the Best Apps Do

- **YNAB:** The plan screen leads with **Ready to Assign**. Overspent categories show a negative Available amount: **red** for cash overspending, **yellow** for credit overspending. A banner reading **"Cover [#] overspent categories"** collects them. Tapping it lets you pick an overspent category and then a category to take money *from*. YNAB auto-fills the shortfall, and you can choose a second source with "Select Another".\[28\]\[29\]\[30\] Move Money works through a from/to picker with a slider or keypad.\[31\] Under/over is shown per category in the Available column, with no aggregate chart. The pattern to copy is "you're ₹800 over in Transport; take it from Fun?" as a single tap.
- **Copilot Money:** The Categories tab opens with a chart of spent versus total budget for the month, then categories sorted by spend. Bars are **green** when on pace, **yellow to orange** when *on pace to exceed* based on spending so far, and **red** once over.\[32\] Rollovers can be switched on per category.\[33\] The pace-based colour is the most useful idea here, because it warns before the budget is gone.
- **Monarch Money:** "Flex budgeting" sorts spending into three buckets (**Fixed, Non-monthly, Flex**) and tracks *one* flexible-spending number.\[34\]\[35\] Rollover formula: last month's rollover + this month's planned − actual = next month's remaining.\[36\] That single flex number is close to what he wants.
- **Simple (closed):** Showed **Safe-to-Spend** in place of the balance: balance minus upcoming bills, goals and pending transactions.\[37\] Overspending pulled money from goals.\[38\] Users missed it badly when PNC shut Simple down.\[15\]\[37\]
- **Wallet by BudgetBakers:** Budgets can be weekly, monthly or yearly.\[39\] The budgets overview shows % spent, **"Total remaining to spend"**, **"Estimated expenses at the end"** and **"Expected balance at the end"**.\[40\] The dashboard is a set of customisable widgets (balance trend, cash flow, pie chart).\[41\] Budgets are not available in Wallet's web app.\[40\] The end-of-period projection is probably the "insight" he values. Copy it as one line, not a widget grid.
- **Goodbudget:** Envelope budgeting where income is divided into envelopes ahead of time.\[42\]
- **Indian apps:** Fi wound down its banking interface in March 2026.\[43\] Jupiter's "Spend Insights" auto-categorise spending but mainly see money moving through Jupiter, not cash.\[44\]\[45\] Axio (formerly Walnut) built its tracking on SMS parsing. CRED (card payments and rewards) and INDmoney (wealth tracking) lead with balances and portfolios, not allowances. None of them offers a weekly allowance with carry-over, and I found no good evidence on how well Simplifi, Spendee, CRED or INDmoney change behaviour. That is the gap his app fills.

## Research Area 4: Logging Friction in India

- **SMS capture from a web app: not possible.** Browsers have no API for reading the SMS inbox. The WebOTP API only hands a web page one-time codes that are formatted for its domain. Native Android apps need READ_SMS. Google Play restricts that permission and allows exceptions such as SMS-based financial transactions, but developers report rejections because "manual input is an alternative".\[46\]\[47\]
- **Workable alternatives for a web app:** (a) an Android automation app such as Tasker or MacroDroid that forwards bank or UPI SMS to a Supabase Edge Function webhook (sideloaded, so no Play review); (b) forwarding bank email alerts to an inbound-email webhook; (c) importing Wallet CSV for backfill. For behaviour change, use any of these only to *reconcile*, never to replace his own entry.
- **Account Aggregator: not feasible for him as a developer.** Financial Information Users must be regulated by RBI, SEBI, IRDAI or PFRDA. Sahamati's FAQ says: "No, you cannot be an FIU or FIP if you are not a regulated entity."\[48\]\[49\] A builder guide puts first-year cost at ₹5–25 lakh+ and 5–10 months (a secondary source).\[50\]
- **Manual vs automatic:** manual wins for awareness (Soman's rehearsal effect; Zhang 2023).\[4\]\[51\] Automatic wins for completeness.\[52\] Since he already logs every transaction as it happens, the bottleneck is speed, not discipline.
- **Quick-entry pattern:** an installable PWA icon that opens straight to a numeric keypad. Enter the **amount first**, then tap one of six category chips ordered by how often he uses them *at this time of day* (bike taxi chips rise to the top before 10:00). Apex is the default account. Saving takes one tap and an optional note. Target: under 5 seconds and 3 taps. A long-press on a recent entry duplicates it (for repeat rides).

## Research Area 5: Dashboard Design

- **First screen:** one number with an instruction attached. Category lists alone produce "okay, what do I do?", and a single number alone hides *where* the problem is. Use both, in strict order: hero number, then the over-budget categories, then everything else collapsed.
- **Overspend visual:** a horizontal bar per category with a tick at 100% and a "pace" marker at today's expected spend. The fill turns amber when ahead of pace (Copilot-style) and **extends past the 100% tick in red** when over, with the overspend amount printed ("+₹885 over"). Don't rely on colour alone; show the sign and the word "over".\[53\]\[54\] Bullet charts are the formal version, but plain bars read faster on a phone.
- **Weekly + monthly together:** the weekly number is the hero. The month appears as one thin strip underneath ("Month: ₹20,000 of ₹30,000 · projected ₹41,000"). Never show two equally sized numbers.
- **Budget left vs real money left:** show the **binding constraint**. Hero = min(budget left this week, real money left in Apex + Cash ÷ remaining weeks). When real money is the tighter limit, label it honestly: "Limited by cash, not budget."
- **Mobile layout:** a single column with the hero in the top third, a sticky "+" button for quick entry, at most five category rows visible, and a "This week's move" card.

## Research Area 6: Technical (Next.js App Router + Supabase)

- **Compute in SQL with a single function.** At his scale (a few thousand rows a year), performance isn't the issue; having one source of truth is. A single `get_dashboard(p_today date)` Postgres function called through `supabase.rpc()` returns JSON with: cycle dates, current week index, weekly allowance after carry-over, spent this week, the binding-constraint number, per-category {budget, spent, pace, over}, and the "move" text inputs. That is one network round trip per page load. Supabase's docs also recommend database functions for multi-statement logic, because supabase-js does not group queries into a transaction.\[55\]
- **Security:** views bypass RLS by default; create them `with (security_invoker = true)`.\[56\]\[57\]\[58\] Make functions `security invoker`, or if they must be `security definer`, filter on `auth.uid()` and grant EXECUTE only to `authenticated`.\[59\]\[60\] Index the policy columns (`transactions(user_id, occurred_at)`) and write policies as `(select auth.uid()) = user_id` so the value is cached per statement.\[57\]\[61\]
- **Next.js:** call the RPC from a Server Component. Make quick-add a Server Action that inserts and then calls `revalidatePath('/')`. Use an optimistic update so the hero number changes instantly, which is the feedback moment that matters.
- **Free tier:** Supabase's pricing page lists a 500 MB database (decades of transactions for one person) and 5 GB egress, and says "Free projects are paused after 1 week of inactivity". Daily logging prevents pausing, but a week off would pause it, so add a free external cron ping as a safeguard.

## Recommendations for Him (Prioritised)

**1. Method: Weighted Weekly Allowance with a real partition.**
- Monthly discretionary cap: ₹30,000. Payday cycle runs from the 30th/31st to the day before the next payday.
- Use day-weights instead of fixed weeks so 30- and 31-day cycles both work. Days 1–14 have weight 0.8 and day 15 onward has weight 1.2. For a 30-day cycle, the base is ₹30,000 ÷ 30.4 ≈ ₹987/day, which gives about **₹790/day (≈₹5,530/week) for days 1–14** and **≈₹1,184/day (≈₹8,290/week) after**.
- **Every Monday, transfer that week's allowance from BOB to Apex** as a ritual. The app shows "Transfer ₹5,530 to Apex" as a checklist item. Apex should never hold more than the current week.
- Carry-over: surplus rolls forward fully. A deficit is spread over the remaining weeks, but no week is cut by more than 30% of its allowance; any excess is flagged as "month debt" and comes out of next cycle's first week. This keeps one bad week from making the month look hopeless.
- Give the unallocated ~₹5,505 a job (₹1,00,505 − ₹55,000 − ₹10,000 − ₹30,000). Make it a "Big Buy" sinking fund so purchases like the ₹6,000 trainer pack are planned, not raided.

**2. This month, right now (honest recovery mode).** By day 12 the plan expected about ₹9,500 spent; he has spent ₹20,000. The real constraint is the ~₹7,200 actually left, which works out to **≈₹379/day, or ≈₹2,650/week, for 19 days**. The app should say exactly that, plus: "Over pace by ₹10,500. Next cycle starts with ₹0 debt only if you stay under ₹2,650/week." Frame it as a challenge with a visible finish line, not as encouragement.

**3. Home screen (in this order, nothing else):**
1. **"₹2,650 left this week"**, which is the binding constraint, plus "₹379/day · 5 days left".
2. **This week's move**: one sentence generated by rules, e.g. "Transport is ₹885 over. Cover it from Fun (₹1,200 left)?" with a one-tap YNAB-style cover button.
3. **Categories (max 6)**, sorted by overspend, with overflowing bars and pace ticks: Food, Transport/Late tax, Fun/Guilty pleasures, Subscriptions, Big Buy, Other.
4. **Month strip**: spent vs ₹30,000, real money left, and a Wallet-style projection ("on pace for ₹X").
5. Sticky **+** for quick add.

**4. Friction and commitment devices to build:**
- **48-hour waitlist** for any non-essential item over ₹1,500, and *every* subscription. He adds the item, a timer starts, and after 48 hours he chooses "still want it". The waitlist shows how much he has saved by letting items expire.
- **Night mode (22:00–06:00):** any entry tagged Subscription or Fun prompts "It's 1 a.m. Is this the 'punish myself' kind? Waitlist it?". A 22:00 push notification (PWA) shows the week's number before the danger window.
- **Late tax envelope:** ₹1,500/month for bike taxis. When it's empty, rides come out of Fun. Store his if-then plan in the app and show it on rides logged before 10:00. A counter makes the comparison concrete: "Rides vs food this month: ₹3,885 vs ₹3,200."
- **Emotion tag** on Fun and Big Buy entries (bored / lonely / celebrating / punishing). After 4 weeks, show one honest line: "62% of your late-night buys are tagged 'lonely'."
- **Payment-side locks (outside the app, do once):** require authentication for all Play/App Store purchases, remove saved cards, and lower the UPI limit on the Apex account.
- **Weekly review (Sunday, 3 minutes):** one screen showing under or over, the leak of the week, and a challenge for next week ("≤2 bike taxis"). He gets a streak for under-allowance weeks. The gamification evidence is thin, but it suits someone who loves challenges.

**5. Logging:** move entry into the PWA quick-add, which should be faster than Wallet. Import Wallet CSV only for history. Don't run two logs in parallel for more than two weeks, because double entry is an abandonment risk.

**6. Leave out:** charts on the home screen, net worth and investment tracking, 50/30/20, more than six categories, bank sync, SMS parsing, Account Aggregator, AI summaries, encouraging messages without numbers ("Great job!"), and daily budgets as the main unit.

## Caveats
- The strongest causal studies (Levi and Benartzi; Gargano and Rossi; Soman and Cheema) involve app adopters, savers or low-income Indian workers, not salaried Bengaluru engineers. The direction of the effects should carry over; the exact sizes may not.\[62\]
- Weekly beating monthly is inferred, not tested directly.
- The evidence that manual beats automatic tracking is partly correlational (Zhang), with lab support for the mechanism (Soman 2001).
- UPI findings are self-reported surveys.
- Figures for waiting rules on blogs and in marketing (64%, 50%, 60–80%) are unverified and should not be used.
- Indian app feature details come from reviews and press, and change quickly; Fi's wind-down is an example.\[43\]\[63\]

## Sources

1. [Mind the App: Mobile Access to Financial Information and Consumer Behavior - LEVI - The Journal of Finance - Wiley Online Library](https://onlinelibrary.wiley.com/doi/10.1111/jofi.70087)
2. [BCFG Newsletter | May 2019 (Issue 1)](https://bcfg.substack.com/p/161357_approved-behavior-change-for-good-newsletter-20190521)
3. [Effects of payment mechanism on spending behavior: The role of rehearsal and immediacy of payments - HKUST SPD](https://repository.hkust.edu.hk/ir/Record/1783.1-23614)
4. <https://www.consumerinterests.org/assets/docs/CIA/CIA2023/ZhangYilingCIA2023.pdf>
5. [Why Manual Expense Tracking Beats Automated Apps (According to Research) — Tefteri Blog](https://tefteri.me/blog/manual-vs-automated-expense-tracking/)
6. [Manual vs. Automated Expense Tracking: Privacy Trade-offs (2026)](https://pocketclear.app/blog/manual-vs-automated-expense-tracking-privacy.html)
7. [Control The Urge To Splurge -- Try Dividing Things Up](https://www.sciencedaily.com/releases/2008/04/080419021157.htm)
8. [Is There a Daily Discount Rate? Evidence from the Food Stamp Nutrition Cycle by Jesse M. Shapiro :: SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=480161)
9. [Is there a daily discount rate? Evidence from the food stamp nutrition cycle - ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0047272704000751)
10. [Monopoly Money: The Effect of Payment Coupling and Form on Spending Behavior](https://www.apa.org/pubs/journals/releases/xap143213.pdf)
11. [The Effect of Payment Transparency on Consumption: Quasi-Experiments from the Field](https://www.researchgate.net/publication/226485295_The_Effect_of_Payment_Transparency_on_Consumption_Quasi-Experiments_from_the_Field)
12. [Earmarking and Partitioning: Increasing Saving by Low-Income Households](https://www.researchgate.net/publication/228137222_Earmarking_and_Partitioning_Increasing_Saving_by_Low-Income_Households)
13. [Earmarking and Partitioning: Increasing Saving by Low-Income Households by Dilip Soman, Amar Cheema :: SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1732709)
14. [Communicating amounts in terms of commonly used budgeting periods increases intentions to claim government benefits](https://www.pnas.org/doi/10.1073/pnas.2205877119)
15. [The fintechs stepping into the void left by Simple](https://www.americanbanker.com/news/the-fintechs-stepping-into-the-void-left-by-simple)
16. [The-Impact-of-Attitude-Towards-E-Payment-and-Shipping- ...](https://www.researchgate.net/publication/384259405_The_Impact_of_Attitude_Towards_E-Payment_and_Shipping_Service_Quality_on_Online_Store_Satisfaction_and_Online_Purchase_Intention/fulltext/66f1a30ffc6cc464897124a9/The-Impact-of-Attitude-Towards-E-Payment-and-Shipping-Service-Quality-on-Online-Store-Satisfaction-and-Online-Purchase-Intention.pdf)
17. [245  2008 by JOURNAL OF CONSUMER RESEARCH, Inc. ●Vol. 35 ●August 2008](https://w4.stern.nyu.edu/research/ulkumen_thomas_morwitz_jcr.pdf)
18. [Buy Now, Pay Later: Impact of Installment Payments on Customer Purchases - Stijn Maesen, Dionysius Ang, 2025](https://journals.sagepub.com/doi/10.1177/00222429241282414)
19. [Impulse Buying: Design Practices and Consumer Needs Carol Moser](https://yardi.people.si.umich.edu/pubs/Schoenebeck_ImpulseBuying19.pdf)
20. [The ‘48-Hour Rule’: A simple trick that can stop impulse spending](https://www.consumeraffairs.com/news/the-48-hour-rule-a-simple-trick-that-can-stop-impulse-spending-031326.html)
21. [Mastering the Psychology of Credit Card Spending: Stop Impulse Buys](https://www.airtel.in/blog/credit-card/the-psychology-of-credit-card-spending-breaking-the-impulse-purchase-cycle/)
22. [Forthcoming Articles - The American Finance Association](https://afajof.org/forthcoming-articles/)
23. [Rocket Money Review: Track Spending, Cancel Subscriptions and More With Ease](https://www.fool.com/money/personal-finance/rocket-money-review/)
24. [Rocket Money Reviews 2026: What Users Really Think - Rocket Money](https://checkthat.ai/brands/rocket-money/reviews)
25. [Rocket Money Reviews and Complaints](https://rocket-money.pissedconsumer.com/complaints/RT-P.html)
26. [341 Rocket Money Reviews](https://rocket-money.pissedconsumer.com/review.html)
27. [What Is Rocket Money? An Honest Review of the Budgeting App - Ramsey](https://www.ramseysolutions.com/budgeting/what-is-rocket-money)
28. [Handling Overspending in YNAB](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi)
29. [Handling Credit Card Overspending in YNAB](https://support.ynab.com/en_us/credit-card-overspending-an-overview-HkMGpSbJs)
30. [When Your YNAB Credit Card Payment Category is Red: A Guide](https://support.ynab.com/en_us/when-your-credit-card-payment-category-is-red-a-guide-SJDSr3Q1i)
31. [Moving Money in YNAB](https://support.ynab.com/moving-money-in-your-plan-ryyCKbBJi)
32. [Categories Tab Overview](https://help.copilot.money/en/articles/9504513-categories-tab-overview)
33. [Editing Budgets by Month](https://help.copilot.money/en/articles/6206293-editing-budgets-by-month)
34. [Using Flex Budgeting](https://help.monarch.com/hc/en-us/articles/32125337244052-Using-Flex-Budgeting)
35. [Creating Your Budget in Monarch](https://help.monarch.com/hc/en-us/articles/360048883631-Creating-Your-Budget-in-Monarch)
36. [Rollover Budgets](https://help.monarch.com/hc/en-us/articles/4411119762196-Rollover-Budgets)
37. [What Happened to Simple? The Online Bank That Was Killed by Its Acquirer](https://debtpayofftools.com/comparisons/what-happened-to-simple/)
38. [Review of Simple's Cash Management Account](https://www.depositaccounts.com/banks/simple/offers/)
39. [Wallet App by BudgetBakers Review: One of The Best Budgeting Apps Out There](https://beebom.com/wallet-app-by-budgetbakers-review/)
40. [Setup Budgets - Wallet Help Center - BudgetBakers](https://support.budgetbakers.com/hc/en-us/articles/7076953735314-Setup-Budgets)
41. [Getting Started with Wallet - Wallet Help Center - BudgetBakers](https://support.budgetbakers.com/hc/en-us/articles/7151352625938-Getting-Started-with-Wallet)
42. [The Best Budget Apps for 2025](https://www.nerdwallet.com/finance/learn/best-budget-apps?advid=2)
43. [Fi Money icon](https://techcrunch.com/2026/03/11/india-neobank-fi-winds-down-banking-services-on-its-platform)
44. [Jupiter: 1-app For Everything Money](https://jupiter.money/)
45. [Money Track vs Jupiter — Honest comparison (Neobank with built-in money insights.)](https://themoneytrack.com/vs/jupiter)
46. [Use of SMS or Call Log permission groups - Play Console Help](https://support.google.com/googleplay/android-developer/answer/10208820?hl=en)
47. [DEV Community](https://dev.to/zeta_byte/ive-been-working-on-a-personal-finance-app-called-finvantage-and-i-recently-hit-a-roadblock-4mjh)
48. [FAQ - Sahamati](https://sahamati.org.in/faq/)
49. [How to join the Account Aggregator Network to share and access financial data - Sahamati](https://sahamati.org.in/how-to-join-the-account-aggregator-network-to-share-and-access-financial-data/)
50. [State of Account Aggregator in 2026: What Founders Actually Need to Know](https://casparser.in/blog/state-of-account-aggregator-2026/)
51. [460  2001 by JOURNAL OF CONSUMER RESEARCH, Inc. ●Vol. 27 ●March 2001](https://www-2.rotman.utoronto.ca/facbios/file/paymechjcr.pdf)
52. [How to Track Expenses: Expense Tracker App Guide](https://senticmoney.com/blog/expense-tracker-app-guide)
53. [Desktop 5: Budgets at desktop widths · Issue #331 · dflippojr/financial-planner](https://github.com/dflippojr/financial-planner/issues/331)
54. [Monthly category budgets with progress · Issue #96 · dflippojr/financial-planner](https://github.com/dflippojr/financial-planner/issues/96)
55. [JavaScript: rpc](https://supabase.com/docs/reference/javascript/rpc)
56. [AI Agents Know About Supabase. They Don't Always Use It Right.](https://supabase.com/blog/supabase-agent-skills)
57. [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
58. [Views](https://supabase.com/docs/guides/database/views)
59. [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
60. [Database functions](https://supabase.com/docs/guides/database/functions)
61. [supabase/examples/prompts/database-rls-policies.md at master · supabase/supabase](https://github.com/supabase/supabase/blob/master/examples/prompts/database-rls-policies.md)
62. [Frontiers](https://www.frontiersin.org/journals/behavioral-economics/articles/10.3389/frbhe.2024.1381080/full)
63. [Jupiter vs Fi Money 2026 — Detailed Comparison: Kaun Sa App Aapke Liye Better Hai? - PaiseHelp](https://www.paisehelp.in/2026/03/jupiter-vs-fi-money-which-is-better.html)
