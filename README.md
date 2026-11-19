# The 11:59 — a night audit for your job search

Put in your master resume and preferences. The app scans job boards, scores every posting against your resume,
and shows **only postings scoring 8/10 or higher** — each with a tailored resume, cover letter, salary guidance,
and a feedback box that teaches future scans.

- Hard filters: your schedule rule (e.g. Mon–Fri business hours only), your salary floor, your locations
- Strict, honest scoring: required certs, tool depth and real experience are checked against the actual posting
- **Zero fabrication**: tailored documents use only facts in your resume
- Application tracker built from your Gmail replies (read-only): Found / Applied / Action needed / Interview / Offer / Rejected
- Word-compatible resume and cover letter downloads

## Quick start (Claude artifact)

1. Open a chat in Claude and paste the contents of `claude-artifact/night-audit.jsx`, asking Claude to run it as an artifact.
2. In Claude, go to Settings → Connectors and connect Gmail and any of Indeed, Dice, ZipRecruiter you use.
3. In the app's Settings, paste your master resume, set salary floor, schedule rule, locations and deal-breakers.
4. Tap **Run Night Audit**.

## Privacy

Everything runs in your own Claude account using your own connectors. There is no server and no API key in this repo.
Gmail is accessed read-only. Your resume is stored only in your artifact storage.

## Limits

- Runs when you tap the button; an artifact can't schedule itself.
- Connector availability varies; MCP server URLs near the top of the file may need adjusting for your account.
- Pick your market (Canada, Philippines, US, UK, Australia, India, UAE) in Settings; add a row to `MARKETS` at the top of the file for another country.

## Disclaimer

Generated resumes and letters are drafts — read every line before sending. Not affiliated with any job board.
