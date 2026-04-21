# College ERP — E2E Tests

Quick end-to-end tests that hit the running backend on `:3000` and verify
the enrollment flow fixes landed on Apr 21, 2026.

## What it tests

1. **save-draft preserves admin-locked rows** — admin locks a MAJOR, student
   tries to overwrite via save-draft, DB state stays intact.
2. **submit returns counts payload** — `{ inserted, skipped_admin_locked,
   total_requested }` is present and correct.
3. **MAJOR touch cascades MIC/MDC wipe** — admin bulkupdate on a MAJOR
   deletes the student's MIC/MDC drafts but leaves AEC drafts alone.
4. **Cascade spares admin-locked MIC/MDC** — only `admin_modified = 0`
   MIC/MDC rows are wiped.

## Setup (once)

```bash
cd tests/
npm install
```

## Run

Backend must be running on `:3000` first:

```bash
cd ../backend
node server.js
```

Then in another terminal:

```bash
cd tests/
node test-enrollment-flow.js
```

## Config

All creds/hosts are at the top of `test-enrollment-flow.js`. Override the
API base with an env var if needed:

```bash
API_BASE=http://localhost:3000 node test-enrollment-flow.js
```

## Notes

- Uses **student 2233 (Taya Rajesh, roll_no 09)** as the test subject.
- Wipes her `student_subject_enrollment` rows before and after every run,
  so don't point this at a DB where you care about her existing data.
- Seeds state via direct MySQL inserts where HTTP would trigger NEP
  validation — this is intentional; we're testing the fix, not the rules.
- Scenario 2 may report "skipped (NEP rules)" if the arbitrary subject
  picks don't form a valid enrollment. That's fine — the rest of the
  scenarios still exercise the fixes. To guarantee Scenario 2's happy
  path runs, pass known-valid subject IDs for the student's programme.

## Exit codes

- `0` — all assertions passed
- `1` — one or more assertion failures (check output)
- `2` — setup failure (DB unreachable, login failed, etc.)
