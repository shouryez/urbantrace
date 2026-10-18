# Model benchmark, 2026-10-18

47 photos and 6 before and after pairs.

| Measure | `gemma4:e4b` | `qwen3-vl:8b-instruct` | `gemma4:e2b` |
| --- | --- | --- | --- |
| Category accuracy | 75% (30/40) | 78% (31/40) | 70% (28/40) |
| Severity within 1 | 93% (37/40) | 95% (38/40) | 80% (32/40) |
| Non issue rejection | 71% (5/7) | 86% (6/7) | 71% (5/7) |
| Verification accuracy | 67% (4/6) | 83% (5/6) | 67% (4/6) |
| Median seconds per call | 5.9 | 3.3 | 3.7 |
| Invalid replies after retry | 0 | 0 | 0 |

Winner: `qwen3-vl:8b-instruct` (highest category accuracy; ties go to the faster model).

F12 threshold: same problem up to 0.166, different problems from 0.008. Suggested EMBED_MATCH_MAX_DISTANCE = 0.02 (the two overlap; check by hand).
