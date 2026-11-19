import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ConciergeBell, Clock, MapPin, Banknote, ExternalLink, FileText, Mail,
  Copy, Check, Settings2, AlertTriangle, ChevronDown, ChevronUp,
  ShieldCheck, Loader2, Moon, X, Download, ListChecks, Inbox, RefreshCw,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  THE 11:59 — a night audit for your job search                     */
/*  Hotels close the day with a night audit; this closes yours:       */
/*  scan the boards, score every posting against YOUR resume, show    */
/*  only the strong ones, with a tailored resume + cover letter.      */
/* ------------------------------------------------------------------ */

const T = {
  ink: "#12161B",
  panel: "#1A2027",
  panel2: "#151B21",
  line: "#2A333D",
  brass: "#D2A24F",
  brassSoft: "#B08A44",
  cream: "#EFE7D3",
  body: "#B9C2CC",
  mute: "#7E8A96",
  pass: "#84B894",
  risk: "#C97B62",
};

const FONT_DISPLAY = "'Fraunces', Georgia, 'Times New Roman', serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const MCP_SERVERS = [
  { type: "url", url: "https://mcp.indeed.com/claude/mcp", name: "indeed" },
  { type: "url", url: "https://mcp.dice.com/mcp", name: "dice" },
  { type: "url", url: "https://api.ziprecruiter.com/mcp", name: "ziprecruiter" },
];

const SOURCES = [
  { key: "indeed", label: "Indeed", mcp: [MCP_SERVERS[0]] },
  { key: "dice", label: "Dice", mcp: [MCP_SERVERS[1]] },
  { key: "ziprecruiter", label: "ZipRecruiter", mcp: [MCP_SERVERS[2]] },
  { key: "web", label: "the open web", search: true },
];

/* Markets: pick one in Settings. Add your own row to support another country. */
const MARKETS = {
  CA: { country: "Canada", currency: "CAD", symbol: "$", floor: 60000, label: "Canada · CAD" },
  PH: { country: "the Philippines", currency: "PHP", symbol: "₱", floor: 480000, label: "Philippines · PHP (Manila)" },
  US: { country: "the United States", currency: "USD", symbol: "$", floor: 55000, label: "United States · USD" },
  GB: { country: "the United Kingdom", currency: "GBP", symbol: "£", floor: 35000, label: "United Kingdom · GBP" },
  AU: { country: "Australia", currency: "AUD", symbol: "$", floor: 70000, label: "Australia · AUD" },
  IN: { country: "India", currency: "INR", symbol: "₹", floor: 600000, label: "India · INR" },
  AE: { country: "the UAE", currency: "AED", symbol: "AED ", floor: 120000, label: "UAE · AED" },
};
const CURRENCIES = {
  CAD: "$", USD: "$", PHP: "₱", GBP: "£", EUR: "€", AUD: "$", NZD: "$", INR: "₹",
  AED: "AED ", SGD: "$", JPY: "¥", CNY: "¥", MXN: "$", BRL: "R$", ZAR: "R", CHF: "CHF ",
};
/* Market gives the country; the salary currency can be picked separately. */
const mk = (cfg) => {
  const m = MARKETS[(cfg && cfg.market) || "CA"] || MARKETS.CA;
  const cur = cfg && cfg.currency && CURRENCIES[cfg.currency] !== undefined ? cfg.currency : m.currency;
  return { ...m, currency: cur, symbol: CURRENCIES[cur] !== undefined ? CURRENCIES[cur] : m.symbol };
};
const defaultLocations = (m) => "Fully remote roles anywhere in " + m.country + " (add your city for onsite or hybrid)";

const GMAIL_MCP = [{ type: "url", url: "https://gmail.mcp.claude.com/mcp", name: "gmail" }];

const K_CFG = "jobscan:config";
const K_SCAN = "jobscan:latest";
const K_SEEN = "jobscan:seen";
const K_TRACK = "jobscan:tracker";
const K_FEEDBACK = "jobscan:feedback";

const FB_VERDICTS = [
  { id: "good", label: "Good match" },
  { id: "bad", label: "Wrong fit" },
  { id: "kit", label: "Kit needs work" },
];

const STATUSES = ["Found", "Applied", "Action needed", "Interview", "Offer", "Rejected"];
const STATUS_RANK = { Found: 0, Applied: 1, "Action needed": 2, Interview: 3, Offer: 4, Rejected: 5 };

/* The tracker starts empty. It fills from your Gmail replies and from scans. */
const SEED_TRACKER = [];

const DEFAULT_RESUME = `YOUR FULL NAME
Your Professional Headline
City, Province | (555) 555-5555 | you@example.com | linkedin.com/in/you

REPLACE THIS TEMPLATE WITH YOUR MASTER RESUME. Paste everything, in full. The app only ever uses facts that appear in this box, so include every employer, title, date, tool, certification, project and measurable result you can honestly claim.

PROFESSIONAL SUMMARY
Two or three sentences on who you are and what you do.

CORE SKILLS
- Skill area: what you actually did with it

PROFESSIONAL EXPERIENCE

Job Title | Company | Mon YYYY - Present
- Achievement or responsibility, with a number where you have one

PROJECTS
- Project name: what you built and how

CERTIFICATIONS
- Certification name

EDUCATION
- Credential | School | Year`;

const DEFAULT_CFG = {
  resume: DEFAULT_RESUME,
  market: "CA",
  minSalary: 60000,
  minFit: 80,
  cfgVersion: 2,
  gmailDays: 45,
  includeUndisclosed: true,
  schedule: "Standard weekday business hours only; no shift work, evenings, overnights, weekends, on-call rotations or 24/7 coverage",
  locations: defaultLocations(MARKETS.CA),
  preferences: "",
  roleHints: "",
};

/* ----------------------------- helpers ----------------------------- */

async function callClaude({ prompt, system, mcpServers = null, useSearch = false, maxTokens = 1000 }) {
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  };
  if (system) body.system = system;
  if (mcpServers) body.mcp_servers = mcpServers;
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j && j.error && j.error.message ? j.error.message : "";
    } catch (e) { /* body not JSON */ }
    throw new Error("API " + res.status + (detail ? ": " + detail.slice(0, 160) : ""));
  }
  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  // A connector can fail inside a 200 response; surface that instead of returning silence.
  const mcpErr = (data.content || []).find((b) => b.type === "mcp_tool_result" && b.is_error);
  if (mcpErr && !text.trim()) {
    const m = Array.isArray(mcpErr.content) ? mcpErr.content.map((c) => c.text || "").join(" ") : String(mcpErr.content || "");
    throw new Error("Connector error: " + (m || "unknown").slice(0, 160));
  }
  return text;
}

function pluckJSON(text) {
  if (!text) return null;
  const s = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = s.indexOf("[");
  const o = s.indexOf("{");
  let start;
  if (a === -1) start = o;
  else if (o === -1) start = a;
  else start = Math.min(a, o);
  if (start < 0) return null;
  const end = Math.max(s.lastIndexOf("]"), s.lastIndexOf("}"));
  if (end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

/* Parses a JSON array even if the reply was truncated mid-item:
   walks the text, tracks strings/braces, and if the closing "]" never
   arrives, closes the array after the last complete object. */
function pluckArray(text) {
  if (!text) return null;
  const s = text.replace(/```json/gi, "").replace(/```/g, "");
  const start = s.indexOf("[");
  if (start < 0) return null;
  let inStr = false, esc = false, brace = 0, bracket = 0, lastObjEnd = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "[") bracket++;
    else if (ch === "]") {
      bracket--;
      if (bracket === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch (e) { break; }
      }
    } else if (ch === "{") brace++;
    else if (ch === "}") {
      brace--;
      if (brace === 0 && bracket === 1) lastObjEnd = i;
    }
  }
  if (lastObjEnd > start) {
    try { return JSON.parse(s.slice(start, lastObjEnd + 1) + "]"); } catch (e) { return null; }
  }
  return null;
}

function jobKey(j) {
  return ((j.url && j.url.length > 10 ? j.url : "") || (j.title + "@" + j.company))
    .toLowerCase()
    .trim();
}

async function sGet(key) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : null;
  } catch (e) {
    return null;
  }
}
async function sSet(key, val) {
  try {
    await window.storage.set(key, JSON.stringify(val));
  } catch (e) {
    /* storage is best-effort */
  }
}

function fmtStamp(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-CA", { weekday: "short", day: "2-digit", month: "short" }) +
      " · " + d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
}

function ownerSlug(resume) {
  const first = (resume || "").split("\n").map((l) => l.trim()).find(Boolean) || "Candidate";
  return first.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "Candidate";
}

function slugify(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isCapsHeader(t) {
  if (t.length < 3 || t.length > 48) return false;
  const letters = t.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

const DOC_OPEN =
  "<html xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'></head><body style='font-family:Calibri,Arial,sans-serif;font-size:10.5pt;line-height:1.35;color:#1a1a1a;'>";
const DOC_CLOSE = "</body></html>";

/* Parses the kit's plain-text resume into a properly formatted Word doc:
   centered name block, ruled ALL-CAPS section headers, bold-label skill
   bullets, and experience entries with right-aligned dates. */
function resumeDocHtml(text) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  let i = 0;
  let html = "";
  let inList = false;
  let section = "";
  let afterEntryHeader = false;
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  const openList = () => { if (!inList) { html += "<ul style='margin:2pt 0 4pt 16pt;padding:0;'>"; inList = true; } };
  const bullet = (t) => {
    openList();
    const m = t.match(/^([A-Za-z][A-Za-z0-9 &\/\-()]{2,44}):\s+(.*)$/);
    html += m
      ? "<li style='margin:0 0 2pt 0;'><b>" + escHtml(m[1]) + ":</b> " + escHtml(m[2]) + "</li>"
      : "<li style='margin:0 0 2pt 0;'>" + escHtml(t) + "</li>";
  };

  const head = [];
  while (i < lines.length && lines[i].trim() !== "") { head.push(lines[i].trim()); i++; }
  if (head.length) {
    html += "<div style='text-align:center;margin-bottom:4pt;'>";
    html += "<div style='font-size:19pt;font-weight:bold;letter-spacing:2pt;'>" + escHtml(head[0]) + "</div>";
    if (head[1]) html += "<div style='font-size:11pt;font-weight:bold;color:#3d3d3d;margin-top:2pt;'>" + escHtml(head[1]) + "</div>";
    for (let h = 2; h < head.length; h++) html += "<div style='font-size:9pt;color:#555555;margin-top:2pt;'>" + escHtml(head[h]) + "</div>";
    html += "</div>";
  }

  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "") { closeList(); continue; }
    if (isCapsHeader(t)) {
      closeList();
      section = t.toUpperCase();
      afterEntryHeader = false;
      html += "<div style='font-size:10.5pt;font-weight:bold;letter-spacing:1.5pt;border-bottom:1pt solid #8a8a8a;margin:10pt 0 4pt 0;padding-bottom:2pt;'>" + escHtml(t) + "</div>";
      continue;
    }
    if (/^[-•*]\s+/.test(t)) { bullet(t.replace(/^[-•*]\s+/, "")); continue; }
    if (t.includes(" | ")) {
      closeList();
      const parts = t.split(" | ").map((p) => p.trim());
      const dates = parts.length >= 3 ? parts[parts.length - 1] : "";
      const left = parts.length >= 3 ? parts.slice(0, -1).join("  \u00b7  ") : t;
      html +=
        "<table style='width:100%;border-collapse:collapse;margin:6pt 0 2pt 0;'><tr><td style='font-size:10.5pt;font-weight:bold;'>" +
        escHtml(left) +
        "</td><td style='text-align:right;font-style:italic;color:#444444;white-space:nowrap;font-size:9.5pt;'>" +
        escHtml(dates) +
        "</td></tr></table>";
      afterEntryHeader = true;
      continue;
    }
    if (
      section.indexOf("SKILL") >= 0 ||
      section.indexOf("CERTIFICATION") >= 0 ||
      (afterEntryHeader && (section.indexOf("EXPERIENCE") >= 0 || section.indexOf("PROJECT") >= 0))
    ) {
      bullet(t);
      continue;
    }
    closeList();
    html += "<p style='margin:2pt 0;'>" + escHtml(t) + "</p>";
  }
  closeList();
  return DOC_OPEN + html + DOC_CLOSE;
}

/* Cover letter with a letterhead pulled from the master resume. */
function coverDocHtml(text, resumeText) {
  const rl = (resumeText || "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const name = rl[0] || "Your Name";
  const contact = rl.find((l) => l.includes("@") || l.includes(" | ")) || "";
  let html = "<div style='text-align:center;font-size:16pt;font-weight:bold;letter-spacing:2pt;'>" + escHtml(name) + "</div>";
  if (contact && contact !== name) {
    html += "<div style='text-align:center;font-size:9pt;color:#555555;margin-top:2pt;'>" + escHtml(contact) + "</div>";
  }
  html += "<div style='border-bottom:1pt solid #8a8a8a;margin:8pt 0 14pt 0;'></div>";
  (text || "").replace(/\r/g, "").split(/\n\s*\n/).forEach((p) => {
    const pt = p.trim();
    if (!pt) return;
    html += "<p style='margin:0 0 10pt 0;font-size:11pt;line-height:1.45;'>" + escHtml(pt).replace(/\n/g, "<br>") + "</p>";
  });
  return DOC_OPEN + html + DOC_CLOSE;
}

/* ------------------------------ prompts ----------------------------- */

function buildSourcePrompt(cfg, src) {
  const toolLine = src.search
    ? "Use web_search to find live postings on job boards and company career pages."
    : "Use the " + src.label + " tools to search live postings.";
  const roleLine = cfg.roleHints && cfg.roleHints.trim().length > 0
    ? "\nCandidate-suggested directions: " + cfg.roleHints.trim() + "."
    : "";
  const prefLine = cfg.preferences && cfg.preferences.trim().length > 0
    ? "\nCandidate preferences and deal-breakers (honour them): " + cfg.preferences.trim()
    : "";
  return (
    "You are a job-search agent. " + toolLine + " Target: currently open, full-time, permanent roles in " + mk(cfg).country + ".\n\n" +
    "Hard constraints, in priority order:\n" +
    "1. SCHEDULE: " + (cfg.schedule || "standard business hours only") + ". Skip any posting that conflicts with this.\n" +
    "2. SALARY: at least " + mk(cfg).symbol + cfg.minSalary + " " + mk(cfg).currency + " per year. Prefer posted pay at or above that; strong matches with undisclosed pay are allowed.\n" +
    "3. ROLE: no title is hardcoded. Read the candidate's resume below and pick roles whose core duties match what the candidate has actually done and is credentialed in. Match seniority to the resume: prefer postings at or just above the demonstrated level, and skip roles that clearly demand far more years or a much more senior title." + roleLine + prefLine + "\n" +
    "4. FRESHNESS: prefer postings from the last 30 days; skip anything posted 60+ days ago or obviously evergreen/reposted.\n\n" +
    "LOCATION: " + cfg.locations + ".\n\n" +
    "CANDIDATE RESUME (for matching only):\n" + cfg.resume + "\n\n" +
    "Return up to 6 distinct postings with working links, favouring the closest matches to the candidate's background. Respond with ONLY a compact JSON array — no prose, no fences: " +
    '[{"title":"","company":"","location":"","mode":"onsite|hybrid|remote","salary":"posted pay or null","schedule":"hours/shift wording or null","url":"direct link","requirements":"the posting\'s hard must-haves incl. required certs and years, 25 words max","blurb":"15 words max"}]'
  );
}

/* Turns saved feedback into calibration text. Match feedback goes to the
   scorer, kit feedback to the writer. Neither can relax a hard gate or the
   no-fabrication rule — the prompts say so explicitly. */
function feedbackBlock(list, kinds, limit) {
  const rows = (list || []).filter((f) => kinds.indexOf(f.verdict) >= 0).slice(-limit);
  if (rows.length === 0) return "";
  return rows
    .map((f) =>
      "- [" + (f.verdict === "good" ? "liked" : f.verdict === "bad" ? "rejected" : "kit note") + "] " +
      f.company + " — " + f.title +
      (typeof f.score === "number" ? " (scored " + (f.score / 10).toFixed(1) + "/10)" : "") +
      (f.note ? ": " + f.note : "")
    )
    .join("\n");
}

function buildScorePrompt(cfg, job, feedbackText) {
  const fb = feedbackText
    ? "CALIBRATION FROM THE USER'S OWN PAST FEEDBACK (treat as ground truth about their taste and what fits; it NEVER relaxes the schedule gate, salary floor, certification gate, or honesty — a liked job still scores low if it fails a hard requirement):\n" + feedbackText + "\n\n"
    : "";
  const pref = cfg.preferences && cfg.preferences.trim().length > 0
    ? "CANDIDATE PREFERENCES AND DEAL-BREAKERS (apply them when scoring):\n" + cfg.preferences.trim() + "\n\n"
    : "";
  return (
    "You are a blunt, honest recruiting analyst. No flattery. Assess this candidate against this posting.\n\n" +
    fb + pref +
    "FIRST: use web_search to retrieve the actual posting (search the URL, and the company + title + requirements). Base everything on the posting's REAL stated requirements — the blurb below is a thin summary and hides hard gates. If you cannot retrieve the full posting, say so in the verdict and score conservatively.\n\n" +
    "MASTER RESUME:\n" + cfg.resume + "\n\n" +
    "JOB POSTING (summary only — verify against the real listing):\n" + JSON.stringify(job) + "\n\n" +
    "Respond with ONLY JSON, no fences: " +
    '{"schedule":"pass|risk|unknown","schedule_note":"12 words max","salary":"pass|below|undisclosed","salary_note":"12 words max, include posted or estimated pay range","fit_score":0,"strengths":["6 words max each, up to 4"],"gaps":["6 words max each, up to 3"],"verdict":"1-2 blunt sentences on whether the candidate should apply"}' +
    "\nScoring rubric — be harsh, this gates what the candidate sees:\n" +
    "- schedule is risk if the posting conflicts with this rule: " + (cfg.schedule || "standard business hours only") + ". Any signal of shifts, weekends, on-call or 24/7 coverage counts when the rule excludes them.\n" +
    "- salary is pass only if posted pay reaches " + mk(cfg).symbol + cfg.minSalary + " " + mk(cfg).currency + ".\n" +
    "- fit_score = realistic odds of passing a recruiter screen TODAY. 80+ means the candidate meets essentially every stated requirement; 60-79 means one minor gap; 40-59 means a real stretch; under 40 means a leap. Most postings should NOT score above 60.\n" +
    "- CERTIFICATION GATE: treat as held ONLY the certifications and licences literally listed in the resume. If the posting REQUIRES one that is not listed (for example ITIL, PMP, CCNA, or a vendor administrator certification), that is a hard gate: score under 40 and name it in gaps.\n" +
    "- TOOL DEPTH: tool-name overlap is NOT fit. For every tool or platform in the requirements, compare what the resume shows the candidate DID with it (user, administrator, developer, architect) against what the role DEMANDS of it. Daily use of a tool does not qualify anyone for an administrator or developer role on it — score those under 40 unless the resume shows that depth.\n" +
    "- EXPERIENCE TYPE: certifications, coursework and personal projects are real, but they are not professional production experience. If the posting requires years of professional experience in a skill that the resume shows only through study or projects, treat it as unmet and score under 55. Credit hands-on skills the resume demonstrates when the posting asks for skills rather than years.\n" +
    "- Any specific named tool or technology in the requirements that is absent from the resume counts as unmet. Subtract hard for required years the resume does not show and for titles clearly senior to the candidate's demonstrated level. NO credit for adjacent or transferable skills where the posting names a specific requirement.\n" +
    "- Score highest where the job IS the work the resume shows the candidate has actually done and is credentialed for — not where it merely mentions a tool the candidate has touched."
  );
}

const KIT_SYSTEM =
  "You tailor resumes and cover letters for a real person. HARD RULES — ZERO FABRICATION: use only the employers, titles, dates, tools, platforms, certifications, projects, education, and metrics that literally appear in the master resume. You may reorder, rephrase, cut, and re-emphasize. You may NOT invent or inflate anything, add tools or certifications not listed, change dates or titles, or manufacture metrics. If the job asks for something the candidate does not have, do not pretend they have it. Output plain text only — no markdown symbols.";

function buildKitResumePrompt(cfg, job) {
  return (
    "MASTER RESUME:\n" + cfg.resume + "\n\n" +
    "TARGET POSTING:\n" + JSON.stringify(job) + "\n\n" +
    "Write a one-page, ATS-friendly resume tailored to this posting. Rewrite the professional summary toward this role, reorder skills to mirror the posting's keywords (only skills the resume truly shows), sharpen experience bullets for relevance, keep the most relevant projects and all certifications, and cut what does not serve this application. Make the candidate read like a top-1% applicant for THIS role using only true material. Plain text, under 550 words total so nothing gets cut off, ready to paste.\n\nOUTPUT FORMAT — follow exactly so the document renders correctly: line 1 = full name only; line 2 = professional headline; line 3 = contact items separated by ' | '; then a blank line; each section introduced by an ALL-CAPS header on its own line (PROFESSIONAL SUMMARY, CORE SKILLS, PROFESSIONAL EXPERIENCE, PROJECTS, CERTIFICATIONS, EDUCATION — omit any section the master resume does not have); every bullet line starts with '- '; skill bullets as '- Label: detail'; each experience entry starts with a line formatted 'Job Title | Company | Dates' followed by its '- ' bullets."
  );
}

function buildKitCoverPrompt(cfg, job) {
  return (
    "MASTER RESUME:\n" + cfg.resume + "\n\n" +
    "TARGET POSTING:\n" + JSON.stringify(job) + "\n\n" +
    "Using ONLY facts from the master resume, respond with ONLY JSON, no fences: " +
    `{"cover_letter":"230 words max, addressed to the company, specific to this role, confident and honest; if the resume shows a career change, frame it as an asset; sign off with the full name from the first line of the resume","salary_ask":"single ${mk(cfg).currency} figure to type when a form demands expected salary, digits like 82000","salary_range":"${mk(cfg).currency} range for conversation, like 78,000-88,000","salary_script":"one polished sentence the candidate can write or say when asked about salary expectations"}` +
    "\nBase the numbers on the posting's pay if disclosed (positioning where the candidate's experience honestly sits), otherwise on the current " + mk(cfg).country + " market for this role and level. Never suggest below " + mk(cfg).symbol + cfg.minSalary + " " + mk(cfg).currency + "."
  );
}

/* ------------------------- tracker + gmail logic -------------------- */

function todayISO() {
  try { return new Date().toLocaleDateString("en-CA"); } catch (e) { return new Date().toISOString().slice(0, 10); }
}

function normName(s) {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(inc|ltd|llc|corp|corporation|company|co|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dayDiff(x, y) {
  const a = Date.parse(x), b = Date.parse(y);
  if (isNaN(a) || isNaN(b)) return 99;
  return Math.abs(a - b) / 86400000;
}

function isUnknownCo(c) {
  const n = normName(c);
  return !n || n.indexOf("unknown") === 0 || n === "indeed";
}

function vagueTitle(t) {
  const n = normName(t);
  return !n || n.indexOf("not stated") >= 0 || n === "role";
}

function sameRole(a, b) {
  const ta = normName(a.title), tb = normName(b.title);
  const titleOk = !!ta && !!tb && (ta === tb || ta.indexOf(tb) >= 0 || tb.indexOf(ta) >= 0);
  const da = a.lastUpdate || a.date, db = b.lastUpdate || b.date;
  const ua = isUnknownCo(a.company), ub = isUnknownCo(b.company);
  if (ua || ub) return titleOk && dayDiff(da, db) <= 1;
  const ca = normName(a.company), cb = normName(b.company);
  const coOk = ca === cb || ca.indexOf(cb) >= 0 || cb.indexOf(ca) >= 0;
  return coOk && (titleOk || vagueTitle(a.title) || vagueTitle(b.title));
}

/* Folds incoming entries (from Gmail or from a scan) into the tracker.
   Statuses only move forward, except a newer rejection always lands and a
   newer interview/offer can reopen a rejected entry. Manual edits stamp
   lastUpdate, so older emails can never overwrite them. */
function mergeTracker(existing, incoming) {
  const list = existing.map((e) => ({ ...e }));
  let added = 0, updated = 0;
  incoming.forEach((inc, n) => {
    const item = {
      company: (inc.company || "").trim(),
      title: (inc.title || "").trim(),
      status: STATUSES.indexOf(inc.status) >= 0 ? inc.status : "Applied",
      date: /^\d{4}-\d{2}-\d{2}/.test(inc.date || "") ? inc.date.slice(0, 10) : todayISO(),
      note: (inc.note || "").trim(),
      url: inc.url || "",
    };
    if (!item.company && !item.title) return;
    const hit = list.find((e) => sameRole(e, item));
    if (!hit) {
      list.push({
        id: "t" + Date.now() + "-" + n + "-" + list.length,
        source: inc.source || "gmail",
        fit: inc.fit,
        appliedDate: item.status === "Found" ? "" : item.date,
        lastUpdate: item.date,
        ...item,
      });
      added++;
      return;
    }
    const incRank = STATUS_RANK[item.status];
    const curRank = STATUS_RANK[hit.status];
    const newer = item.date >= (hit.lastUpdate || "");
    let change = false;
    if (item.status === "Rejected") change = hit.status !== "Rejected" && (newer || curRank <= 1);
    else if (curRank === 5) change = (incRank === 3 || incRank === 4) && newer;
    else change = incRank > curRank;
    if (change) {
      hit.status = item.status;
      hit.lastUpdate = item.date;
      if (item.note) hit.note = item.note;
      if (item.url) hit.url = item.url;
      if (item.status !== "Found" && !hit.appliedDate) hit.appliedDate = item.date;
      updated++;
    } else if (!hit.url && item.url) {
      hit.url = item.url;
    }
    if (isUnknownCo(hit.company) && !isUnknownCo(item.company)) hit.company = item.company;
    if (vagueTitle(hit.title) && !vagueTitle(item.title)) hit.title = item.title;
  });
  return { list, added, updated };
}

function buildGmailPrompt(fromDay, toDay) {
  const range = fromDay === 0
    ? "newer_than:" + toDay + "d"
    : "older_than:" + fromDay + "d newer_than:" + toDay + "d";
  return (
    "You are syncing a job-application tracker from the user's Gmail. READ-ONLY: use only the Gmail search/read tools; never send, draft, label, archive, or delete anything.\n\n" +
    "Search the inbox (Gmail range: " + range + ") for job-application email. Try several searches: confirmations (\"thank you for applying\", \"application received\", \"we received your application\", \"Indeed Application\"); declines (\"not moving forward\", \"other candidates\", \"unfortunately\", \"update on your application\"); interview or assessment signals (\"interview\", \"schedule a call\", \"phone screen\", \"assessment\", \"your availability\", \"next steps\"); offers; and employers reaching out directly. Open a message when the snippet is cut off before the decision.\n\n" +
    "IGNORE: job-alert digests, newsletters, cold recruiter pitches, paid career-coaching or resume services, mystery shopping, marketing.\n\n" +
    "Return ONE entry per application with its LATEST status. Status must be exactly one of: Applied (confirmation or receipt only), Action needed (incomplete application, candidate account to create, assessment to complete, or an employer/recruiter asking him something), Interview (interview or phone screen invited or scheduled), Offer, Rejected. If the email never names the company (Indeed receipts), use \"Unknown (via Indeed)\". date = date of the latest relevant email, YYYY-MM-DD. note = 12 words max. url = the Gmail thread link if the tool gives one, else empty.\n\n" +
    "Respond with ONLY a compact JSON array, no prose, no fences, up to 30 entries: " +
    '[{"company":"","title":"","status":"","date":"","note":"","url":""}]'
  );
}

async function syncGmail(cfg) {
  const days = Math.max(14, Number(cfg.gmailDays) || 45);
  const windows = days > 14 ? [[0, 14], [14, days]] : [[0, 14]];
  const settled = await Promise.allSettled(
    windows.map(([a, b]) =>
      callClaude({ prompt: buildGmailPrompt(a, b), mcpServers: GMAIL_MCP, maxTokens: 3500 }).then((raw) => pluckArray(raw) || [])
    )
  );
  if (settled.every((r) => r.status === "rejected")) {
    const why = settled[0].reason && settled[0].reason.message ? settled[0].reason.message : "Gmail did not respond";
    throw new Error(why);
  }
  const items = [];
  settled.forEach((r) => { if (r.status === "fulfilled") items.push(...r.value); });
  return items;
}

async function buildKit(cfg, job, kitFeedback) {
  const sys = kitFeedback
    ? KIT_SYSTEM + "\n\nTHE USER'S PAST NOTES ON DRAFTED MATERIALS (adjust tone, emphasis, length and structure accordingly; the zero-fabrication rule always wins over any note):\n" + kitFeedback
    : KIT_SYSTEM;
  const resumeTxt = await callClaude({ system: sys, prompt: buildKitResumePrompt(cfg, job), maxTokens: 1800 });
  const coverRaw = await callClaude({ system: sys, prompt: buildKitCoverPrompt(cfg, job), maxTokens: 1400 });
  const cv = pluckJSON(coverRaw) || {};
  return {
    resume: (resumeTxt || "").trim(),
    cover: (cv.cover_letter || "").trim(),
    salaryAsk: cv.salary_ask ? String(cv.salary_ask).replace(/[^0-9]/g, "") : "",
    salaryRange: cv.salary_range || "",
    salaryScript: cv.salary_script || "",
  };
}

function statusTone(s) {
  if (s === "Offer" || s === "Interview") return T.pass;
  if (s === "Action needed") return T.brass;
  if (s === "Rejected") return T.risk;
  if (s === "Applied") return T.body;
  return T.mute;
}

const STATUS_ORDER = { Offer: 0, Interview: 1, "Action needed": 2, Applied: 3, Found: 4, Rejected: 5 };

/* ------------------------------ UI bits ----------------------------- */

function Chip({ icon: Icon, children }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
      style={{ background: T.panel, border: "1px solid " + T.line, color: T.body, fontFamily: FONT_MONO }}
    >
      <Icon size={12} style={{ color: T.brass }} />
      {children}
    </span>
  );
}

function Badge({ tone, children }) {
  const color = tone === "pass" ? T.pass : tone === "risk" ? T.risk : T.mute;
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
      style={{ border: "1px solid " + color, color, fontFamily: FONT_MONO }}
    >
      {children}
    </span>
  );
}

function CopyBtn({ text, id, copied, onCopy }) {
  const done = copied === id;
  return (
    <button
      onClick={() => onCopy(text, id)}
      className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors"
      style={{
        border: "1px solid " + (done ? T.pass : T.line),
        color: done ? T.pass : T.body,
        background: "transparent",
        fontFamily: FONT_MONO,
      }}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function DlBtn({ content, filename, doc }) {
  const fname = filename + (doc ? ".doc" : ".txt");
  return (
    <button
      onClick={() => download(fname, content, doc ? "application/msword" : "text/plain")}
      className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors"
      style={{ border: "1px solid " + T.line, color: T.body, background: "transparent", fontFamily: FONT_MONO }}
    >
      <Download size={12} />
      {doc ? ".doc" : ".txt"}
    </button>
  );
}

/* ------------------------------ Job card ---------------------------- */

function JobCard({ job, cfg, onGenKit, copied, onCopy, onToggle, onFeedback }) {
  const sc = job.score || {};
  const [tab, setTab] = useState("resume");
  const [fbVerdict, setFbVerdict] = useState(job.feedback ? job.feedback.verdict : "good");
  const [fbNote, setFbNote] = useState(job.feedback ? job.feedback.note : "");
  const schedTone = sc.schedule === "pass" ? "pass" : sc.schedule === "risk" ? "risk" : "unknown";
  const salTone = sc.salary === "pass" ? "pass" : sc.salary === "below" ? "risk" : "unknown";

  return (
    <div className="rounded-lg overflow-hidden" style={{ background: T.panel, border: "1px solid " + T.line }}>
      {/* ledger row */}
      <div className="flex">
        {/* folio: fit score */}
        <div
          className="flex flex-col items-center justify-center px-4 py-5 shrink-0"
          style={{ borderRight: "1px solid " + T.line, background: T.panel2, minWidth: "84px" }}
        >
          <div style={{ fontFamily: FONT_MONO, fontSize: "28px", color: T.brass, lineHeight: 1 }}>
            {typeof sc.fit_score === "number" ? (sc.fit_score / 10).toFixed(1) : "—"}
          </div>
          <div className="mt-1 text-xs tracking-widest" style={{ color: T.mute, fontFamily: FONT_MONO }}>
            FIT /10
          </div>
        </div>

        {/* entry */}
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base" style={{ color: T.cream, fontFamily: FONT_DISPLAY, fontWeight: 600 }}>
                  {job.title}
                </h3>
                {job.isNew && (
                  <span
                    className="rounded px-1.5 py-0.5 text-xs"
                    style={{ background: T.brass, color: T.ink, fontFamily: FONT_MONO, fontWeight: 700 }}
                  >
                    NEW
                  </span>
                )}
                {job.tracked && (
                  <span
                    className="rounded px-1.5 py-0.5 text-xs"
                    style={{ border: "1px solid " + statusTone(job.tracked), color: statusTone(job.tracked), fontFamily: FONT_MONO }}
                  >
                    {job.tracked === "Rejected" ? "REJECTED" : "ALREADY " + job.tracked.toUpperCase()}
                  </span>
                )}
                {job.auto && job.kit && (
                  <span
                    className="rounded px-1.5 py-0.5 text-xs"
                    style={{ border: "1px solid " + T.pass, color: T.pass, fontFamily: FONT_MONO }}
                  >
                    KIT READY
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-sm" style={{ color: T.body }}>
                {job.company} · {job.location} {job.mode ? "· " + job.mode : ""}
              </div>
            </div>
            <span className="text-xs shrink-0" style={{ color: T.mute, fontFamily: FONT_MONO }}>
              {job.source}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={schedTone}>
              <Clock size={11} />
              {sc.schedule_note || (sc.schedule === "pass" ? "Schedule OK" : "hours unlisted")}
            </Badge>
            <Badge tone={salTone}>
              <Banknote size={11} />
              {sc.salary_note || job.salary || "pay undisclosed"}
            </Badge>
          </div>

          {sc.verdict && (
            <p className="mt-3 text-sm italic" style={{ color: T.body }}>
              {sc.verdict}
            </p>
          )}

          {(sc.strengths || sc.gaps) && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs" style={{ fontFamily: FONT_MONO }}>
              {sc.strengths && sc.strengths.length > 0 && (
                <div>
                  <div style={{ color: T.pass }}>+ carries</div>
                  {sc.strengths.map((s, i) => (
                    <div key={i} style={{ color: T.body }}>· {s}</div>
                  ))}
                </div>
              )}
              {sc.gaps && sc.gaps.length > 0 && (
                <div>
                  <div style={{ color: T.risk }}>- gaps</div>
                  {sc.gaps.map((g, i) => (
                    <div key={i} style={{ color: T.body }}>· {g}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
                style={{ border: "1px solid " + T.brassSoft, color: T.brass, fontFamily: FONT_MONO }}
              >
                <ExternalLink size={12} /> Open posting
              </a>
            )}
            <button
              onClick={() => (job.kit ? onToggle(job.id) : onGenKit(job.id))}
              disabled={job.kitLoading}
              className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
              style={{
                background: job.kitLoading ? T.panel2 : T.brass,
                color: job.kitLoading ? T.mute : T.ink,
                fontFamily: FONT_MONO,
                fontWeight: 600,
                border: "1px solid " + (job.kitLoading ? T.line : T.brass),
              }}
            >
              {job.kitLoading ? (
                <>
                  <Loader2 size={12} className="animate-spin" /> Preparing kit…
                </>
              ) : job.kit ? (
                <>
                  {job.open ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Application kit
                </>
              ) : (
                <>
                  <FileText size={12} /> Generate application kit
                </>
              )}
            </button>
          </div>

          {job.kitErr && (
            <p className="mt-2 text-xs" style={{ color: T.risk, fontFamily: FONT_MONO }}>
              {job.kitErr} — tap the button to retry.
            </p>
          )}
        </div>
      </div>

      {/* kit drawer */}
      {job.kit && job.open && (
        <div style={{ borderTop: "1px solid " + T.line, background: T.panel2 }} className="p-4">
          <div className="flex gap-2 mb-3">
            {[
              { id: "resume", label: "Resume", icon: FileText },
              { id: "cover", label: "Cover letter", icon: Mail },
              { id: "salary", label: "Salary", icon: Banknote },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
                style={{
                  fontFamily: FONT_MONO,
                  background: tab === t.id ? T.panel : "transparent",
                  border: "1px solid " + (tab === t.id ? T.brassSoft : T.line),
                  color: tab === t.id ? T.brass : T.mute,
                }}
              >
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>

          {tab === "resume" && (
            <div>
              <div className="flex justify-end gap-2 mb-2">
                <DlBtn content={resumeDocHtml(job.kit.resume)} filename={ownerSlug(cfg.resume) + "_Resume_" + slugify(job.company)} doc />
                <DlBtn content={job.kit.resume} filename={ownerSlug(cfg.resume) + "_Resume_" + slugify(job.company)} />
                <CopyBtn text={job.kit.resume} id={job.id + "-resume"} copied={copied} onCopy={onCopy} />
              </div>
              <pre
                className="whitespace-pre-wrap text-xs leading-relaxed p-3 rounded max-h-96 overflow-y-auto"
                style={{ background: T.ink, border: "1px solid " + T.line, color: T.body, fontFamily: FONT_MONO }}
              >
                {job.kit.resume}
              </pre>
            </div>
          )}

          {tab === "cover" && (
            <div>
              <div className="flex justify-end gap-2 mb-2">
                <DlBtn content={coverDocHtml(job.kit.cover, cfg.resume)} filename={ownerSlug(cfg.resume) + "_Cover_Letter_" + slugify(job.company)} doc />
                <DlBtn content={job.kit.cover} filename={ownerSlug(cfg.resume) + "_Cover_Letter_" + slugify(job.company)} />
                <CopyBtn text={job.kit.cover} id={job.id + "-cover"} copied={copied} onCopy={onCopy} />
              </div>
              <pre
                className="whitespace-pre-wrap text-xs leading-relaxed p-3 rounded max-h-96 overflow-y-auto"
                style={{ background: T.ink, border: "1px solid " + T.line, color: T.body, fontFamily: FONT_MONO }}
              >
                {job.kit.cover}
              </pre>
            </div>
          )}

          {tab === "salary" && (
            <div className="space-y-3">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span style={{ fontFamily: FONT_MONO, fontSize: "26px", color: T.brass }}>
                  {job.kit.salaryAsk ? "$" + job.kit.salaryAsk + " CAD" : "—"}
                </span>
                <span className="text-xs" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                  type this if a form demands one number
                </span>
              </div>
              {job.kit.salaryRange && (
                <div className="text-sm" style={{ color: T.body, fontFamily: FONT_MONO }}>
                  Conversation range: ${job.kit.salaryRange} CAD
                </div>
              )}
              {job.kit.salaryScript && (
                <div>
                  <div className="flex justify-end mb-2">
                    <CopyBtn text={job.kit.salaryScript} id={job.id + "-script"} copied={copied} onCopy={onCopy} />
                  </div>
                  <blockquote
                    className="text-sm p-3 rounded"
                    style={{ background: T.ink, borderLeft: "2px solid " + T.brass, color: T.body }}
                  >
                    {job.kit.salaryScript}
                  </blockquote>
                </div>
              )}
            </div>
          )}

          <p className="mt-3 text-xs" style={{ color: T.mute }}>
            Draft, not gospel — read every line before it leaves your hands. Nothing here was invented, but you are the final audit.
          </p>
        </div>
      )}

      {/* feedback */}
      <div style={{ borderTop: "1px solid " + T.line }} className="p-4">
        <div className="text-xs tracking-widest mb-2" style={{ color: T.mute, fontFamily: FONT_MONO }}>
          YOUR FEEDBACK · TEACHES THE NEXT SCAN
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          {FB_VERDICTS.map((v) => (
            <button
              key={v.id}
              onClick={() => setFbVerdict(v.id)}
              className="rounded-full px-3 py-1 text-xs"
              style={{
                fontFamily: FONT_MONO,
                border: "1px solid " + (fbVerdict === v.id ? T.brass : T.line),
                color: fbVerdict === v.id ? T.brass : T.mute,
                background: fbVerdict === v.id ? T.panel2 : "transparent",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <textarea
          value={fbNote}
          onChange={(e) => setFbNote(e.target.value)}
          placeholder="Why? (e.g. “needs a cert I don’t have”, “cover letter too stiff”, “exactly the kind of role I want”)"
          className="w-full rounded p-2.5 text-xs"
          rows={2}
          style={{ background: T.ink, border: "1px solid " + T.line, color: T.body, fontFamily: FONT_MONO, resize: "vertical" }}
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={() => onFeedback(job.id, fbVerdict, fbNote)}
            className="rounded px-3 py-1.5 text-xs"
            style={{ background: T.brass, color: T.ink, fontFamily: FONT_MONO, fontWeight: 600 }}
          >
            Save feedback
          </button>
          {job.feedback && (
            <span className="text-xs" style={{ color: T.pass, fontFamily: FONT_MONO }}>
              Saved · will shape future scans
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Tracker view -------------------------- */

function TrackerView({ tracker, filter, setFilter, onStatus, onRemove, onSync, syncing, info }) {
  const counts = {};
  STATUSES.forEach((s) => { counts[s] = 0; });
  tracker.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
  const submitted = tracker.filter((t) => t.status !== "Found").length;
  const shown = tracker
    .filter((t) => filter === "All" || t.status === filter)
    .slice()
    .sort((a, b) => {
      const d = (STATUS_ORDER[a.status] || 0) - (STATUS_ORDER[b.status] || 0);
      if (d !== 0) return d;
      return (b.lastUpdate || "").localeCompare(a.lastUpdate || "");
    });

  return (
    <section>
      <div className="flex items-end justify-between mb-1">
        <div style={{ fontFamily: FONT_MONO }}>
          <div className="text-xs tracking-widest" style={{ color: T.mute }}>APPLICATION LEDGER</div>
          <div className="text-sm" style={{ color: T.cream }}>
            {submitted} submitted · {counts.Interview + counts.Offer} interviews/offers · {counts.Rejected} declined
          </div>
        </div>
        <button
          onClick={onSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs"
          style={{ border: "1px solid " + T.brassSoft, color: syncing ? T.mute : T.brass, fontFamily: FONT_MONO, background: "transparent" }}
        >
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {syncing ? "Reading Gmail…" : "Sync Gmail"}
        </button>
      </div>
      <div className="mb-3" style={{ borderBottom: "1px solid " + T.brassSoft }} />

      {info && (
        <p className="mb-3 text-xs" style={{ color: info.ok ? T.mute : T.risk, fontFamily: FONT_MONO }}>
          {info.ok
            ? "Gmail synced " + fmtStamp(info.at) + " · " + info.added + " new, " + info.updated + " updated · read-only"
            : "Gmail sync failed (" + info.err + ") — make sure Gmail is connected in your Claude settings, then sync again."}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        {["All"].concat(STATUSES).map((s) => {
          const active = filter === s;
          const n = s === "All" ? tracker.length : counts[s] || 0;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className="rounded-full px-3 py-1 text-xs"
              style={{
                fontFamily: FONT_MONO,
                border: "1px solid " + (active ? T.brass : T.line),
                color: active ? T.brass : T.mute,
                background: active ? T.panel : "transparent",
              }}
            >
              {s} {n}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-lg p-6 text-center text-sm" style={{ background: T.panel, border: "1px dashed " + T.line, color: T.mute }}>
          Nothing here yet — run an audit or tap Sync Gmail.
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((t) => (
            <div key={t.id} className="rounded-lg p-3" style={{ background: T.panel, border: "1px solid " + T.line, borderLeft: "3px solid " + statusTone(t.status) }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm" style={{ color: T.cream, fontFamily: FONT_DISPLAY, fontWeight: 600 }}>
                    {t.company}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: T.body }}>{t.title}</div>
                </div>
                <div className="text-xs shrink-0 text-right" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                  <div>{t.lastUpdate || ""}</div>
                  <div>{t.source === "scan" ? "scan" : "gmail"}{typeof t.fit === "number" ? " · " + (t.fit / 10).toFixed(1) + "/10" : ""}</div>
                </div>
              </div>
              {t.note && (
                <p className="mt-1.5 text-xs" style={{ color: T.mute }}>{t.note}</p>
              )}
              <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                <select
                  value={t.status}
                  onChange={(e) => onStatus(t.id, e.target.value)}
                  className="rounded px-2 py-1 text-xs"
                  style={{ background: T.ink, border: "1px solid " + T.line, color: statusTone(t.status), fontFamily: FONT_MONO }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {t.url && (
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs"
                    style={{ border: "1px solid " + T.line, color: T.body, fontFamily: FONT_MONO }}
                  >
                    <ExternalLink size={11} /> {t.source === "scan" ? "Posting" : "Email"}
                  </a>
                )}
                <button
                  onClick={() => onRemove(t.id)}
                  aria-label="Remove"
                  className="ml-auto rounded p-1"
                  style={{ color: T.mute, background: "transparent", border: "none" }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------- App -------------------------------- */

export default function App() {
  const [cfg, setCfg] = useState(DEFAULT_CFG);
  const [scan, setScan] = useState(null); // {auditNo, stamp, jobs}
  const [seen, setSeen] = useState([]);
  const [phase, setPhase] = useState(null); // 'search' | 'score'
  const [err, setErr] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copied, setCopied] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const needsResume = !cfg.resume || cfg.resume.indexOf("REPLACE THIS TEMPLATE") >= 0 || cfg.resume.trim().length < 200;
  const [view, setView] = useState("audit"); // 'audit' | 'tracker'
  const [tracker, setTracker] = useState([]);
  const [filter, setFilter] = useState("All");
  const [syncing, setSyncing] = useState(false);
  const [gmailInfo, setGmailInfo] = useState(null);
  const trackerRef = useRef([]);
  const feedbackRef = useRef([]);

  const commitTracker = useCallback((list) => {
    trackerRef.current = list;
    setTracker(list);
    sSet(K_TRACK, list);
  }, []);

  useEffect(() => {
    (async () => {
      const c = await sGet(K_CFG);
      if (c) {
        const merged = { ...DEFAULT_CFG, ...c };
        // v2: the show-line is 8/10 and only jobs at or above it are displayed.
        if (c.cfgVersion !== 2) {
          merged.minFit = 80;
          merged.cfgVersion = 2;
        }
        setCfg(merged);
      }
      const fbSaved = await sGet(K_FEEDBACK);
      if (Array.isArray(fbSaved)) feedbackRef.current = fbSaved;
      const s = await sGet(K_SCAN);
      if (s) setScan(s);
      const sn = await sGet(K_SEEN);
      if (sn) setSeen(sn);
      let t = await sGet(K_TRACK);
      if (!Array.isArray(t)) {
        t = SEED_TRACKER;
        sSet(K_TRACK, t);
      }
      trackerRef.current = t;
      setTracker(t);
      setLoaded(true);
      if ((DEFAULT_CFG.resume || "").indexOf("REPLACE THIS TEMPLATE") >= 0) setShowSettings(true);
    })();
  }, []);

  const applyGmailResult = useCallback((g) => {
    if (g.ok) {
      const m = mergeTracker(trackerRef.current, g.items);
      commitTracker(m.list);
      setGmailInfo({ ok: true, at: new Date().toISOString(), added: m.added, updated: m.updated });
    } else {
      setGmailInfo({ ok: false, at: new Date().toISOString(), err: g.err || "unknown error" });
    }
  }, [commitTracker]);

  const syncGmailOnly = useCallback(async () => {
    setSyncing(true);
    try {
      const items = await syncGmail(cfg);
      applyGmailResult({ ok: true, items });
    } catch (e) {
      applyGmailResult({ ok: false, err: e && e.message ? e.message : "error" });
    }
    setSyncing(false);
  }, [cfg, applyGmailResult]);

  const setEntryStatus = useCallback((id, status) => {
    const today = todayISO();
    commitTracker(
      trackerRef.current.map((t) =>
        t.id === id
          ? { ...t, status, lastUpdate: today, appliedDate: t.appliedDate || (status !== "Found" ? today : ""), note: t.note }
          : t
      )
    );
  }, [commitTracker]);

  const removeEntry = useCallback((id) => {
    commitTracker(trackerRef.current.filter((t) => t.id !== id));
  }, [commitTracker]);

  const saveFeedback = useCallback((jobId, verdict, note) => {
    if (!scan) return;
    const job = scan.jobs.find((j) => j.id === jobId);
    if (!job) return;
    const entry = {
      id: jobId,
      company: job.company,
      title: job.title,
      verdict,
      note: (note || "").trim().slice(0, 300),
      score: job.score && typeof job.score.fit_score === "number" ? job.score.fit_score : undefined,
      at: new Date().toISOString(),
    };
    const next = feedbackRef.current.filter((f) => f.id !== jobId).concat(entry).slice(-60);
    feedbackRef.current = next;
    sSet(K_FEEDBACK, next);
    setScan((prev) => {
      if (!prev) return prev;
      const n = { ...prev, jobs: prev.jobs.map((j) => (j.id === jobId ? { ...j, feedback: { verdict, note: entry.note } } : j)) };
      sSet(K_SCAN, n);
      return n;
    });
  }, [scan]);

  const clearFeedback = useCallback(() => {
    feedbackRef.current = [];
    sSet(K_FEEDBACK, []);
    setScan((prev) => {
      if (!prev) return prev;
      const n = { ...prev, jobs: prev.jobs.map((j) => ({ ...j, feedback: null })) };
      sSet(K_SCAN, n);
      return n;
    });
  }, []);

  const persistScan = useCallback((next) => {
    setScan(next);
    sSet(K_SCAN, next);
  }, []);

  const onCopy = useCallback(async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e2) { /* give up quietly */ }
      document.body.removeChild(ta);
    }
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
  }, []);

  const saveCfg = useCallback(() => {
    sSet(K_CFG, cfg);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1600);
  }, [cfg]);

  const clearHistory = useCallback(() => {
    setScan(null);
    setSeen([]);
    sSet(K_SCAN, null);
    sSet(K_SEEN, []);
  }, []);

  const runScan = useCallback(async () => {
    setErr(null);
    sSet(K_CFG, cfg);
    setPhase("search");
    // Gmail sync runs alongside every scan — read-only, results land in the tracker.
    const gmailP = syncGmail(cfg)
      .then((items) => ({ ok: true, items }))
      .catch((e) => ({ ok: false, err: e && e.message ? e.message : "error" }));
    let gmailApplied = false;
    const applyOnce = async () => {
      if (gmailApplied) return;
      gmailApplied = true;
      applyGmailResult(await gmailP);
    };
    try {
      const settled = await Promise.allSettled(
        SOURCES.map((src) =>
          callClaude({
            prompt: buildSourcePrompt(cfg, src),
            mcpServers: src.mcp || null,
            useSearch: !!src.search,
            maxTokens: 2200,
          }).then((raw) => pluckArray(raw) || [])
        )
      );

      const perSource = {};
      const pool = [];
      settled.forEach((r, idx) => {
        const src = SOURCES[idx];
        if (r.status === "fulfilled") {
          perSource[src.key] = r.value.length;
          r.value.slice(0, 6).forEach((j) => pool.push({ ...j, source: src.key }));
        } else {
          perSource[src.key] = -1;
        }
      });

      const dd = new Map();
      pool.forEach((j) => {
        const k = ((j.url && j.url.length > 10 ? j.url : "") || ((j.title || "") + "@" + (j.company || "")))
          .toLowerCase()
          .trim();
        if (k && !dd.has(k)) dd.set(k, j);
      });
      let jobs = Array.from(dd.values());

      if (jobs.length === 0) {
        const anyAnswered = Object.values(perSource).some((v) => v >= 0);
        setErr(
          anyAnswered
            ? "Sources answered but surfaced nothing readable this pass. Ring the bell again in a minute — if it repeats, loosen a filter in Settings."
            : "No source responded at all. Check that Indeed, Dice and ZipRecruiter are connected in your Claude settings, then try again."
        );
        await applyOnce();
        setPhase(null);
        return;
      }

      jobs = jobs.slice(0, 16).map((j, i) => ({
        id: "j" + Date.now() + "-" + i,
        title: j.title || "Untitled role",
        company: j.company || "Unknown company",
        location: j.location || "",
        mode: j.mode || "",
        salary: j.salary || null,
        schedule: j.schedule || null,
        url: j.url || "",
        source: j.source || "web",
        requirements: j.requirements || "",
        blurb: j.blurb || "",
        score: null,
        kit: null,
        open: false,
      }));

      setPhase("score");
      const matchFb = feedbackBlock(feedbackRef.current, ["good", "bad"], 12);
      const kitFb = feedbackBlock(feedbackRef.current, ["kit"], 6);
      const scored = [];
      for (let i = 0; i < jobs.length; i += 3) {
        const chunk = jobs.slice(i, i + 3);
        const results = await Promise.all(
          chunk.map(async (job) => {
            try {
              const txt = await callClaude({ prompt: buildScorePrompt(cfg, job, matchFb), useSearch: true });
              const sc = pluckJSON(txt);
              return { ...job, score: sc && !Array.isArray(sc) ? sc : { schedule: "unknown", salary: job.salary ? "unknown" : "undisclosed", fit_score: null, verdict: "Scoring failed — open the posting and judge it yourself." } };
            } catch (e) {
              return { ...job, score: { schedule: "unknown", salary: "undisclosed", fit_score: null, verdict: "Scoring failed — open the posting and judge it yourself." } };
            }
          })
        );
        scored.push(...results);
      }

      const kept = scored.filter((j) => {
        const sc = j.score || {};
        if (sc.schedule === "risk") return false;
        if (sc.salary === "below") return false;
        if (sc.salary === "undisclosed" && !cfg.includeUndisclosed) return false;
        // Only postings that were actually scored AND clear the show-line (default 8/10) are shown.
        if (typeof sc.fit_score !== "number" || sc.fit_score < (cfg.minFit || 0)) return false;
        return true;
      });

      const seenSet = new Set(seen);
      kept.forEach((j) => {
        j.isNew = !seenSet.has(jobKey(j));
      });
      kept.sort((a, b) => ((b.score && b.score.fit_score) || 0) - ((a.score && a.score.fit_score) || 0));

      const nextSeen = Array.from(new Set([...seen, ...kept.map(jobKey)])).slice(-300);
      setSeen(nextSeen);
      sSet(K_SEEN, nextSeen);

      // Fold Gmail into the tracker first, so postings you already applied to are recognised.
      setPhase("gmail");
      await applyOnce();
      const today = todayISO();
      kept.forEach((j) => {
        const hit = trackerRef.current.find((t) => sameRole(t, { company: j.company, title: j.title, date: today }));
        if (hit && hit.status !== "Found") j.tracked = hit.status;
      });

      // Everything shown cleared the line, so everything shown gets its resume + cover letter
      // straight away (skipping roles already applied to; capped per run to bound the wait).
      const hot = kept.filter((j) => !j.tracked).slice(0, 6);
      if (hot.length > 0) {
        setPhase("kits");
        for (let i = 0; i < hot.length; i += 2) {
          await Promise.all(
            hot.slice(i, i + 2).map(async (j) => {
              try {
                j.kit = await buildKit(cfg, j, kitFb);
                j.open = true;
                j.auto = true;
              } catch (e) {
                j.kitErr = "Auto-kit failed";
              }
            })
          );
        }
      }

      // Log every cleared posting in the tracker as Found.
      const found = kept.map((j) => ({
        company: j.company,
        title: j.title,
        status: "Found",
        date: today,
        note: "Found by scan" + (j.kit ? " · kit ready" : ""),
        url: j.url,
        source: "scan",
        fit: j.score && typeof j.score.fit_score === "number" ? j.score.fit_score : undefined,
      }));
      commitTracker(mergeTracker(trackerRef.current, found).list);

      const auditNo = (scan && scan.auditNo ? scan.auditNo : 0) + 1;
      persistScan({ auditNo, stamp: new Date().toISOString(), jobs: kept, dropped: scored.length - kept.length, perSource });
      setPhase(null);
    } catch (e) {
      await applyOnce();
      setErr("Scan failed: " + (e && e.message ? e.message : "unknown error") + ". Check your Indeed / Dice / ZipRecruiter connections and try again.");
      setPhase(null);
    }
  }, [cfg, seen, scan, persistScan, applyGmailResult, commitTracker]);

  const genKit = useCallback(async (jobId) => {
    if (!scan) return;
    const mark = (patch) => {
      setScan((prev) => {
        if (!prev) return prev;
        const next = { ...prev, jobs: prev.jobs.map((j) => (j.id === jobId ? { ...j, ...patch } : j)) };
        return next;
      });
    };
    mark({ kitLoading: true, kitErr: null });
    const job = scan.jobs.find((j) => j.id === jobId);
    try {
      const kit = await buildKit(cfg, job, feedbackBlock(feedbackRef.current, ["kit"], 6));
      setScan((prev) => {
        if (!prev) return prev;
        const next = { ...prev, jobs: prev.jobs.map((j) => (j.id === jobId ? { ...j, kit, kitLoading: false, open: true } : j)) };
        sSet(K_SCAN, next);
        return next;
      });
    } catch (e) {
      mark({ kitLoading: false, kitErr: "Kit generation failed" });
    }
  }, [scan, cfg]);

  const toggleKit = useCallback((jobId) => {
    setScan((prev) => {
      if (!prev) return prev;
      return { ...prev, jobs: prev.jobs.map((j) => (j.id === jobId ? { ...j, open: !j.open } : j)) };
    });
  }, []);

  const newCount = scan ? scan.jobs.filter((j) => j.isNew).length : 0;

  return (
    <div className="min-h-screen" style={{ background: T.ink, color: T.body, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,400..600&display=swap'); ::selection{background:" + T.brass + ";color:" + T.ink + ";} @media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important;}}"}</style>

      <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* masthead */}
        <header className="mb-8">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs tracking-widest mb-1" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                <Moon size={12} style={{ color: T.brass }} />
                NIGHT AUDIT · JOB MARKET EDITION
              </div>
              <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 600, fontStyle: "italic", fontSize: "40px", lineHeight: 1, color: T.cream }}>
                The 11:59
              </h1>
            </div>
            <button
              onClick={() => setShowSettings((s) => !s)}
              aria-label="Settings"
              className="rounded-full p-2.5"
              style={{ border: "1px solid " + T.line, color: showSettings ? T.brass : T.mute, background: T.panel }}
            >
              {showSettings ? <X size={16} /> : <Settings2 size={16} />}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Chip icon={Clock}>Schedule filter on</Chip>
            <Chip icon={Banknote}>≥ {mk(cfg).symbol}{Number(cfg.minSalary).toLocaleString()} {mk(cfg).currency}</Chip>
            <Chip icon={MapPin}>{String(cfg.locations || "").slice(0, 38)}</Chip>
          </div>

          <div className="mt-5 flex gap-2">
            {[
              { id: "audit", label: "Audit", icon: ConciergeBell, badge: 0 },
              {
                id: "tracker",
                label: "Tracker",
                icon: ListChecks,
                badge: tracker.filter((t) => t.status === "Action needed" || t.status === "Interview" || t.status === "Offer").length,
              },
            ].map((tb) => (
              <button
                key={tb.id}
                onClick={() => setView(tb.id)}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm"
                style={{
                  fontFamily: FONT_MONO,
                  background: view === tb.id ? T.panel : "transparent",
                  border: "1px solid " + (view === tb.id ? T.brassSoft : T.line),
                  color: view === tb.id ? T.brass : T.mute,
                }}
              >
                <tb.icon size={14} />
                {tb.label}
                {tb.badge > 0 && (
                  <span className="rounded-full px-1.5 text-xs" style={{ background: T.brass, color: T.ink, fontWeight: 700 }}>
                    {tb.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        {/* settings */}
        {showSettings && (
          <section className="mb-8 rounded-lg p-4 space-y-4" style={{ background: T.panel, border: "1px solid " + T.line }}>
            <div>
              <label className="block text-xs tracking-widest mb-2" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                MASTER RESUME (source of truth — nothing outside it gets written)
              </label>
              <textarea
                value={cfg.resume}
                onChange={(e) => setCfg({ ...cfg, resume: e.target.value })}
                className="w-full h-56 rounded p-3 text-xs leading-relaxed"
                style={{ background: T.ink, border: "1px solid " + T.line, color: T.body, fontFamily: FONT_MONO, resize: "vertical" }}
              />
            </div>
            <div>
              <label className="block text-xs tracking-widest mb-2" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                MARKET &amp; CURRENCY
              </label>
              <select
                value={cfg.market || "CA"}
                onChange={(e) => {
                  const prev = mk(cfg);
                  const next = MARKETS[e.target.value] || MARKETS.CA;
                  setCfg({
                    ...cfg,
                    market: e.target.value,
                    currency: undefined,
                    minSalary: cfg.minSalary === prev.floor ? next.floor : cfg.minSalary,
                    locations: cfg.locations === defaultLocations(prev) ? defaultLocations(next) : cfg.locations,
                  });
                }}
                className="w-full rounded p-2.5 text-sm"
                style={{ background: T.ink, border: "1px solid " + T.line, color: T.cream, fontFamily: FONT_MONO }}
              >
                {Object.keys(MARKETS).map((k) => (
                  <option key={k} value={k}>{MARKETS[k].label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs tracking-widest mb-2" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                  MINIMUM SALARY ({mk(cfg).currency}/yr)
                </label>
                <div className="flex gap-2">
                  <select
                    value={mk(cfg).currency}
                    onChange={(e) => setCfg({ ...cfg, currency: e.target.value })}
                    className="rounded p-2.5 text-sm"
                    style={{ background: T.ink, border: "1px solid " + T.line, color: T.cream, fontFamily: FONT_MONO }}
                  >
                    {Object.keys(CURRENCIES).map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={cfg.minSalary}
                    onChange={(e) => setCfg({ ...cfg, minSalary: Number(e.target.value) || 0 })}
                    className="w-full rounded p-2.5 text-sm"
                    style={{ background: T.ink, border: "1px solid " + T.line, color: T.cream, fontFamily: FONT_MONO }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs tracking-widest mb-2" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                  SHOW JOBS AT FIT ≥ (80 = 8/10)
                </label>
                <input
                  type="number"
                  value={cfg.minFit}
                  onChange={(e) => setCfg({ ...cfg, minFit: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                  className="w-full rounded p-2.5 text-sm"
                  style={{ background: T.ink, border: "1px solid " + T.line, color: T.cream, fontFamily: FONT_MONO }}
                />
              </div>
              <div>
                <label className="block text-xs tracking-widest mb-2" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                  ROLE HINTS (optional)
                </label>
                <input
                  type="text"
                  value={cfg.roleHints}
                  placeholder="optional: roles you want it to lean toward"
                  onChange={(e) => setCfg({ ...cfg, roleHints: e.target.value })}
                  className="w-full rounded p-2.5 text-sm"
                  style={{ background: T.ink, border: "1px solid " + T.line, color: T.cream, fontFamily: FONT_MONO }}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs tracking-widest mb-2" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                  GMAIL LOOKBACK (DAYS)
                </label>
                <input
                  type="number"
                  value={cfg.gmailDays}
                  onChange={(e) => setCfg({ ...cfg, gmailDays: Math.max(14, Math.min(120, Number(e.target.value) || 45)) })}
                  className="w-full rounded p-2.5 text-sm"
                  style={{ background: T.ink, border: "1px solid " + T.line, color: T.cream, fontFamily: FONT_MONO }}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs tracking-widest mb-2" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                SCHEDULE RULE
              </label>
              <input
                type="text"
                value={cfg.schedule}
                onChange={(e) => setCfg({ ...cfg, schedule: e.target.value })}
                className="w-full rounded p-2.5 text-sm"
                style={{ background: T.ink, border: "1px solid " + T.line, color: T.cream, fontFamily: FONT_MONO }}
              />
            </div>
            <div>
              <label className="block text-xs tracking-widest mb-2" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                PREFERENCES &amp; DEAL-BREAKERS (optional)
              </label>
              <textarea
                value={cfg.preferences}
                placeholder="e.g. no sales roles, no travel, prefer small teams, must offer benefits"
                onChange={(e) => setCfg({ ...cfg, preferences: e.target.value })}
                className="w-full h-20 rounded p-2.5 text-sm"
                style={{ background: T.ink, border: "1px solid " + T.line, color: T.cream, fontFamily: FONT_MONO, resize: "vertical" }}
              />
            </div>
            <div>
              <label className="block text-xs tracking-widest mb-2" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                LOCATIONS
              </label>
              <input
                type="text"
                value={cfg.locations}
                onChange={(e) => setCfg({ ...cfg, locations: e.target.value })}
                className="w-full rounded p-2.5 text-sm"
                style={{ background: T.ink, border: "1px solid " + T.line, color: T.cream, fontFamily: FONT_MONO }}
              />
            </div>
            <button
              onClick={() => setCfg({ ...cfg, includeUndisclosed: !cfg.includeUndisclosed })}
              className="flex items-center gap-2 text-sm"
              style={{ color: T.body }}
            >
              <span
                className="inline-flex items-center justify-center rounded w-4 h-4"
                style={{ border: "1px solid " + (cfg.includeUndisclosed ? T.brass : T.line), background: cfg.includeUndisclosed ? T.brass : "transparent" }}
              >
                {cfg.includeUndisclosed && <Check size={11} style={{ color: T.ink }} />}
              </span>
              Show strong matches even when pay is undisclosed
            </button>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={saveCfg}
                className="rounded px-4 py-2 text-sm"
                style={{ background: T.brass, color: T.ink, fontFamily: FONT_MONO, fontWeight: 600 }}
              >
                {savedFlash ? "Saved" : "Save settings"}
              </button>
              <button
                onClick={clearHistory}
                className="rounded px-4 py-2 text-sm"
                style={{ border: "1px solid " + T.line, color: T.mute, fontFamily: FONT_MONO }}
              >
                Clear scan history
              </button>
              <button
                onClick={clearFeedback}
                className="rounded px-4 py-2 text-sm"
                style={{ border: "1px solid " + T.line, color: T.mute, fontFamily: FONT_MONO }}
              >
                Clear feedback
              </button>
            </div>
          </section>
        )}

        {view === "tracker" && (
          <TrackerView
            tracker={tracker}
            filter={filter}
            setFilter={setFilter}
            onStatus={setEntryStatus}
            onRemove={removeEntry}
            onSync={syncGmailOnly}
            syncing={syncing}
            info={gmailInfo}
          />
        )}

        {view === "audit" && (<>
        {/* run */}
        <section className="mb-8">
          <button
            onClick={runScan}
            disabled={!!phase || !loaded || needsResume}
            className="w-full rounded-lg py-4 flex items-center justify-center gap-3 transition-opacity"
            style={{
              background: phase ? T.panel : T.brass,
              color: phase ? T.mute : T.ink,
              border: "1px solid " + (phase ? T.line : T.brass),
              fontFamily: FONT_MONO,
              fontWeight: 700,
              fontSize: "15px",
              letterSpacing: "0.05em",
              opacity: loaded && !needsResume ? 1 : 0.5,
            }}
          >
            {phase ? <Loader2 size={18} className="animate-spin" /> : <ConciergeBell size={18} />}
            {phase === "search"
              ? "QUERYING THE BOARDS + GMAIL…"
              : phase === "score"
              ? "AUDITING AGAINST YOUR RESUME…"
              : phase === "gmail"
              ? "UPDATING THE TRACKER…"
              : phase === "kits"
              ? "WRITING YOUR RESUME + COVER LETTERS…"
              : "RUN NIGHT AUDIT"}
          </button>
          {phase && (
            <p className="mt-2 text-xs text-center" style={{ color: T.mute, fontFamily: FONT_MONO }}>
              {phase === "search"
                ? "→ indeed · dice · ziprecruiter · web in parallel, Gmail read-only alongside"
                : phase === "score"
                ? "→ reading each posting's real requirements, then scoring — slower, honest"
                : phase === "gmail"
                ? "→ matching Gmail replies to your applications"
                : "→ tailored resume + cover letter for every posting that cleared the line"}
            </p>
          )}
          {!phase && gmailInfo && (
            <p className="mt-2 text-xs text-center" style={{ color: gmailInfo.ok ? T.mute : T.risk, fontFamily: FONT_MONO }}>
              {gmailInfo.ok
                ? "Gmail synced · " + gmailInfo.added + " new, " + gmailInfo.updated + " updated in Tracker"
                : "Gmail sync failed (" + gmailInfo.err + ") — check the Gmail connection"}
            </p>
          )}
          {err && (
            <div className="mt-3 rounded p-3 flex items-start gap-2 text-sm" style={{ border: "1px solid " + T.risk, color: T.risk }}>
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}
        </section>

        {/* report */}
        {scan ? (
          <section>
            <div className="flex items-end justify-between mb-1">
              <div style={{ fontFamily: FONT_MONO }}>
                <div className="text-xs tracking-widest" style={{ color: T.mute }}>AUDIT No. {String(scan.auditNo).padStart(3, "0")}</div>
                <div className="text-sm" style={{ color: T.cream }}>{fmtStamp(scan.stamp)}</div>
              </div>
              <div className="text-xs text-right" style={{ color: T.mute, fontFamily: FONT_MONO }}>
                <div>
                  {scan.jobs.length} at {(cfg.minFit / 10).toFixed(1)}/10+{typeof scan.dropped === "number" ? " · " + scan.dropped + " hidden below the line" : ""}
                  {newCount > 0 && <span style={{ color: T.brass }}> · {newCount} new</span>}
                </div>
                {scan.perSource && (
                  <div className="mt-0.5">
                    {Object.entries(scan.perSource)
                      .map(([k, v]) => (k === "ziprecruiter" ? "zip" : k) + " " + (v < 0 ? "×" : v))
                      .join(" · ")}
                  </div>
                )}
              </div>
            </div>
            <div className="mb-4" style={{ borderBottom: "1px solid " + T.brassSoft }} />

            {scan.jobs.length === 0 ? (
              <div className="rounded-lg p-6 text-center text-sm" style={{ background: T.panel, border: "1px dashed " + T.line, color: T.mute }}>
                Nothing cleared the {(cfg.minFit / 10).toFixed(1)}/10 line this pass — {typeof scan.dropped === "number" ? scan.dropped : "every"} scored lower or failed a hard filter and stays hidden. That is the strict gate working, not a bug. Run again tomorrow, or lower the show-line in Settings if you want to peek at near-misses.
              </div>
            ) : (
              <div className="space-y-4">
                {scan.jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    cfg={cfg}
                    onGenKit={genKit}
                    onToggle={toggleKit}
                    onFeedback={saveFeedback}
                    copied={copied}
                    onCopy={onCopy}
                  />
                ))}
              </div>
            )}
          </section>
        ) : (
          loaded && (
            <section className="rounded-lg p-8 text-center" style={{ background: T.panel, border: "1px dashed " + T.line }}>
              <ShieldCheck size={22} className="mx-auto mb-3" style={{ color: T.brass }} />
              <p className="text-sm mb-1" style={{ color: T.cream, fontFamily: FONT_DISPLAY, fontSize: "17px" }}>
                No audits on file.
              </p>
              <p className="text-xs max-w-sm mx-auto" style={{ color: T.mute }}>
                Tap Run Night Audit and it will sweep Indeed, Dice, ZipRecruiter and the open web, cut anything that breaks your schedule rule or pay floor, and score what survives.
              </p>
            </section>
          )
        )}
        </>)}

        <footer className="mt-10 text-center text-xs" style={{ color: T.mute, fontFamily: FONT_MONO }}>
          runs on demand — open at 11:59, ring the bell · Gmail is read-only · every kit is a draft: you are the final audit
        </footer>
      </div>
    </div>
  );
}
