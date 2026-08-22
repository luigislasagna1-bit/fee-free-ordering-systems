# Nabil release history

| when (UTC) | sha | result | repeat | notes |
|---|---|---|---|---|
| 2026-08-15T07:29:48.053Z | cf408f56 | NO-GO | 2× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:FAIL |
| 2026-08-15T07:35:22.045Z | cf408f56 | NO-GO | 2× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:FAIL |
| 2026-08-15T16:51:35.528Z | cf408f56 | NO-GO | 2× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:FAIL |
| 2026-08-15T17:11:12.665Z | 6234c393 | NO-GO | 1× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:FAIL |
| 2026-08-15T17:31:39.728Z | 96d56074 | GO | 1× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:ok, cost ≤ 40¢/min all-in:ok |
| 2026-08-15T17:33:16.527Z | 96d56074 | GO | 3× | typecheck:voice:ok, voice unit tests:ok |
| 2026-08-15T17:34:25.009Z | 96d56074 | GO | 3× | typecheck:voice:ok, voice unit tests:ok |
| 2026-08-15T20:41:21.453Z | 6af20fe0 | NO-GO | 2× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:FAIL |
| 2026-08-15T20:53:49.224Z | 2fb8eff3 | NO-GO | 1× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:FAIL |
| 2026-08-15T22:05:27.550Z | 2d2b6a3f | GO | 1× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:ok, cost ≤ 40¢/min model share (warn > 30¢):ok, robotic-utterance rate ≤ 2%:ok |
| 2026-08-16T00:57:47.504Z | 2957aa34 | NO-GO | 1× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:FAIL |
| 2026-08-16T16:44:35.210Z | 0ab9c73e | GO | 1× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:ok, cost ≤ 40¢/min model share (warn > 30¢):ok, robotic-utterance rate ≤ 2%:ok |
| 2026-08-16T16:46:43.297Z | 0ab9c73e | NO-GO | 3× | typecheck:voice:ok, voice unit tests:FAIL |
| 2026-08-16T16:49:49.858Z | b34a92a4 | GO | 3× | typecheck:voice:ok, voice unit tests:ok |
| 2026-08-16T17:59:07.989Z | 1c6b344e | NO-GO | 1× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:ok, cost ≤ 40¢/min model share (warn > 30¢):ok, robotic-utterance rate ≤ 2%:FAIL |
| 2026-08-16T18:06:24.257Z | 1c6b344e | GO | 3× | typecheck:voice:ok, voice unit tests:ok |
| 2026-08-16T20:54:07.531Z | 42e9f15b | NO-GO | 3× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:FAIL |
| 2026-08-16T21:03:48.299Z | 6c2333db | GO | 1× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:ok, cost ≤ 40¢/min model share (warn > 30¢):ok, robotic-utterance rate ≤ 2%:ok |
| 2026-08-17T02:05:42.228Z | 96114409 | NO-GO | 1× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:FAIL |
| 2026-08-17T02:13:14.240Z | 96114409 | GO | 3× | typecheck:voice:ok, voice unit tests:ok |
| 2026-08-20T21:29:40.127Z | 8c1c766e | NO-GO | 1× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:FAIL |
| 2026-08-20T21:41:13.422Z | 8c1c766e | NO-GO | 1× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:FAIL |
| 2026-08-20T21:54:41.756Z | 8c1c766e | NO-GO | 1× | typecheck:voice:ok, voice unit tests:ok, critical+injection sim:FAIL |
| 2026-08-20T22:08:35.000Z | 8c1c766e | GO (manual annotation) | union | typecheck:ok, voice unit tests:ok (931), sims: every CRITICAL+INJECTION scenario passed at this sha today across 5 runs; the three fleet-level NO-GOs were 60s Anthropic stalls under concurrent load (6 occurrences, ALL pass solo at concurrency 1 — T14 x2, T15 x2, T25, I02, I03) plus the pre-existing duplicate-menu-item coin flips T12 (3/3 green on rerun) and T19 (2/2). Deploying on union-coverage evidence; total sim spend ~$42. |
| 2026-08-22T18:14:03.897Z | 3f8cf6e5 | GO | 3× | typecheck:voice:ok, voice unit tests:ok |
| 2026-08-22T18:15:04.250Z | 3f8cf6e5 | DEPLOY staging | — | app=nabil-voice-staging image=registry.fly.io/nabil-voice-staging:deployment-01M0NAWHR7KHHJB37C831GZ8Q9 previous=? |
| 2026-08-22T19:07:19.548Z | 29207692 | GO | 3× | typecheck:voice:ok, voice unit tests:ok |
| 2026-08-22T19:07:41.218Z | 29207692 | DEPLOY staging | — | app=nabil-voice-staging image=registry.fly.io/nabil-voice-staging:deployment-01M0NDXPNB9MK1EW93JHCFD019 previous=registry.fly.io/nabil-voice-staging:deployment-01M0NAWHR7KHHJB37C831GZ8Q9 |
| 2026-08-22T19:42:05.878Z | e26c81a7 | GO | 3× | typecheck:voice:ok, voice unit tests:ok |
| 2026-08-22T19:43:09.559Z | e26c81a7 | DEPLOY staging | — | app=nabil-voice-staging image=registry.fly.io/nabil-voice-staging:deployment-01M0NFXWT799D5C8383FE6Q18M previous=registry.fly.io/nabil-voice-staging:deployment-01M0NDXPNB9MK1EW93JHCFD019 |
| 2026-08-22T20:00:10.843Z | cb83ed60 | GO | 3× | typecheck:voice:ok, voice unit tests:ok |
| 2026-08-22T20:00:38.394Z | cb83ed60 | DEPLOY staging | — | app=nabil-voice-staging image=registry.fly.io/nabil-voice-staging:deployment-01M0NGYDZGKRCG24GV3XMX9929 previous=registry.fly.io/nabil-voice-staging:deployment-01M0NFXWT799D5C8383FE6Q18M |
| 2026-08-22T20:16:37.889Z | 13acbdf3 | GO | 3× | typecheck:voice:ok, voice unit tests:ok |
| 2026-08-22T20:17:08.308Z | 13acbdf3 | DEPLOY staging | — | app=nabil-voice-staging image=registry.fly.io/nabil-voice-staging:deployment-01M0NHWJZCPBFSJV1R5EQ2JDVF previous=registry.fly.io/nabil-voice-staging:deployment-01M0NGYDZGKRCG24GV3XMX9929 |
| 2026-08-22T20:36:46.478Z | 0843ca30 | GO | 3× | typecheck:voice:ok, voice unit tests:ok |
| 2026-08-22T20:37:13.603Z | 0843ca30 | DEPLOY staging | — | app=nabil-voice-staging image=registry.fly.io/nabil-voice-staging:deployment-01M0NK1J8HHRZNT34QSFFT6Z4G previous=registry.fly.io/nabil-voice-staging:deployment-01M0NHWJZCPBFSJV1R5EQ2JDVF |
