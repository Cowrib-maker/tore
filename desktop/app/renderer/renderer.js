"use strict";
// All engine/server text is inserted with textContent only (never innerHTML).
const $ = (id) => document.getElementById(id);
const api = window.spell;
let issues = [];
let pendingTransferId = null;
let timer = null;
let justActivated = false;
let versions = { engineVersion: "", dataPackVersion: "" };

const MSG = {
  default: "Худалдан авсан лицензийн кодоо оруулж идэвхжүүлнэ үү.",
  OFFLINE_LIMIT: "Офлайн горимд ажиллах хугацаа дууссан. Интернет холболт шаардлагатай: холбогдоод «Эрх шалгах» дарна уу.",
  CLOCK_ROLLBACK: "Компьютерийн цаг буцсан байна. Интернет холболт шаардлагатай: холбогдож эрхээ шалгана уу.",
  TOKEN_INVALID: "Эрхийн мэдээлэл баталгаажсангүй. Интернет холболт шаардлагатай: эрхээ дахин шалгана уу.",
  EXPIRED: "Лицензийн хугацаа дууссан. Автоматаар сунгагдахгүй; шинэ лиценз авч идэвхжүүлнэ үү.",
  ACTIVATION_NOT_ACTIVE: "Энэ лиценз өөр компьютерт шилжсэн эсвэл чөлөөлөгдсөн байна. Хэрэв энэ компьютер дээр дахин ашиглах бол шилжүүлэн идэвхжүүлнэ үү.",
  LICENSE_EXPIRED: "Лицензийн хугацаа дууссан. Автоматаар сунгагдахгүй; шинэ лиценз авч идэвхжүүлнэ үү.",
  LICENSE_REVOKED: "Лиценз хүчингүй болсон байна.",
  INSTALLATION_REVOKED: "Энэ суулгалтын эрх хаагдсан байна.",
  DEACTIVATED: "Энэ компьютерээс лиценз чөлөөлөгдсөн.",
};

function setNet() {
  const b = $("net-badge");
  b.hidden = navigator.onLine;
  b.textContent = "Офлайн горим";
}
window.addEventListener("online", setNet);
window.addEventListener("offline", setNet);

async function refresh() {
  setNet();
  const r = await api.licenseState();
  const state = r.ok ? r.value : null;
  const active = !!state && state.kind === "ACTIVE";
  $("lock").hidden = active;
  $("app").hidden = !active;
  const badge = $("lic-badge");
  if (active) {
    badge.textContent = `Идэвхтэй · ${state.licenseExpiresAtLocal} хүртэл`;
    if (justActivated) { $("ready-note").hidden = false; }
    const note = $("offline-note");
    if (state.refreshDue) {
      note.hidden = false;
      note.textContent = `Эрхээ шинэчлэх хугацаа болсон. Интернет холболт шаардлагатай. Офлайн горимд ${state.offlineUntilLocal} хүртэл ажиллана.`;
    } else note.hidden = true;
    await loadDict();
    return;
  }
  $("ready-note").hidden = true;
  justActivated = false;
  let msg = MSG.default;
  if (!state) { badge.textContent = "Алдаа"; msg = (r && r.message) || msg; }
  else if (state.kind === "EXPIRED") { badge.textContent = "Хугацаа дууссан"; msg = MSG.EXPIRED; }
  else if (state.kind === "VALIDATION_REQUIRED") { badge.textContent = "Шалгалт шаардлагатай"; msg = MSG[state.reason] || MSG.TOKEN_INVALID; }
  else { badge.textContent = "Идэвхжээгүй"; if (state.endedReason) msg = MSG[state.endedReason] || msg; }
  $("lock-msg").textContent = msg;
  $("validate-lock").hidden = !state || state.kind !== "VALIDATION_REQUIRED";
}

const showErr = (r) => { $("err").textContent = r && r.message ? r.message : ""; };

$("act-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  showErr(null);
  const r = await api.activate($("code").value);
  if (r.ok) { $("code").value = ""; justActivated = true; return refresh(); }
  if (r.code === "TRANSFER_CONFIRMATION_REQUIRED") {
    pendingTransferId = r.details && r.details.replacesActivationId;
    $("transfer-warning").textContent = r.message;
    $("transfer").hidden = false;
    return;
  }
  showErr(r);
});
$("transfer-yes").addEventListener("click", async () => {
  $("transfer").hidden = true;
  const r = await api.activate($("code").value, pendingTransferId || undefined);
  if (r.ok) { $("code").value = ""; pendingTransferId = null; justActivated = true; return refresh(); }
  showErr(r);
});
$("transfer-no").addEventListener("click", () => { $("transfer").hidden = true; pendingTransferId = null; });
const doValidate = async () => { const r = await api.validate(); showErr(r.ok ? null : r); refresh(); };
$("validate").addEventListener("click", doValidate);
$("validate-lock").addEventListener("click", doValidate);
$("deactivate").addEventListener("click", async () => {
  if (!confirm("Энэ компьютерээс лицензийг чөлөөлөх үү? Дараа нь өөр компьютерт идэвхжүүлж болно.")) return;
  const r = await api.deactivate(); showErr(r.ok ? null : r); refresh();
});

// ── checking ────────────────────────────────────────────────────────────────
const MAX_SUGS = 3;
async function runCheck() {
  const text = $("text").value;
  const r = await api.check(text, $("unknown").checked, $("advisory").checked);
  if (!r.ok) { $("stats").textContent = r.message; return; }
  if (r.value.locked) return refresh();
  if (text !== $("text").value) return; // typing continued: a newer check is already scheduled
  issues = r.value.issues;
  versions = { engineVersion: r.value.engineVersion, dataPackVersion: r.value.dataPackVersion };
  const bad = issues.filter((i) => i.verdict === "MISSPELLED").length;
  $("stats").textContent = text.trim()
    ? `${r.value.stats.words} үг · ` + (bad ? `${bad} алдаа` : "Алдаа олдсонгүй")
    : "Текстээ бичнэ үү";
  $("count").textContent = issues.length ? `(${issues.length})` : "";
  closePop();
  paintBackdrop(text);
  render();
}
$("unknown").addEventListener("change", runCheck);
$("advisory").addEventListener("change", runCheck);
$("text").addEventListener("input", () => {
  paintBackdrop($("text").value, true);
  closePop();
  clearTimeout(timer);
  timer = setTimeout(runCheck, 350);
});
$("text").addEventListener("scroll", () => { $("backdrop").scrollTop = $("text").scrollTop; closePop(); });
// A click (or caret move) inside a marked word opens the correction popover; Escape closes it.
const caretIssue = () => {
  const t = $("text");
  if (t.selectionStart !== t.selectionEnd) return -1;
  const p = t.selectionStart;
  return issues.findIndex((i) => p >= i.range.start && p <= i.range.end);
};
$("text").addEventListener("click", () => { const k = caretIssue(); if (k >= 0) openPop(k); else closePop(); });
$("text").addEventListener("keyup", (e) => { if (e.key === "Escape") closePop(); else if (e.key.startsWith("Arrow")) { const k = caretIssue(); if (k >= 0) openPop(k); else closePop(); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePop(); });

// Underline layer under the textarea. `stale` hides marks while the text is being edited.
function paintBackdrop(text, stale) {
  const bd = $("backdrop");
  bd.textContent = "";
  if (stale) { bd.append(document.createTextNode(text + "\n")); return; }
  let pos = 0;
  const order = issues.map((_, k) => k).sort((a, b) => issues[a].range.start - issues[b].range.start);
  for (const k of order) {
    const i = issues[k];
    if (i.range.start < pos) continue;
    bd.append(document.createTextNode(text.slice(pos, i.range.start)));
    const m = document.createElement("mark");
    m.className = i.verdict === "MISSPELLED" ? "bad" : i.verdict === "ADVISORY" ? "adv" : "unk";
    m.dataset.i = String(k);
    m.textContent = text.slice(i.range.start, i.range.end);
    bd.append(m);
    pos = i.range.end;
  }
  bd.append(document.createTextNode(text.slice(pos) + "\n"));
  bd.scrollTop = $("text").scrollTop;
}

const btn = (label, fn, cls) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.className = cls || "sm ghost"; b.addEventListener("click", fn); return b; };
const sugLabel = (s) => (s === "" ? "(устгах)" : s === " " ? "(нэг зай)" : s);

async function applyFix(issue, value) {
  const rr = await api.replace($("text").value, issue, value);
  if (!rr.ok) { $("stats").textContent = rr.message; return; }
  const t = $("text");
  t.value = rr.value.text;
  const caret = issue.range.start + value.length;
  t.focus(); t.setSelectionRange(caret, caret);
  runCheck();
}

function closePop() { const p = $("pop"); p.hidden = true; p.textContent = ""; }

function openPop(k) {
  const issue = issues[k];
  const pop = $("pop");
  pop.textContent = "";
  const bad = issue.verdict === "MISSPELLED";
  const adv = issue.verdict === "ADVISORY";
  const w = document.createElement("div"); w.className = "pw"; w.textContent = issue.token; pop.append(w);
  if (issue.suggestions.length && (bad || adv)) {
    const note = document.createElement("div"); note.className = "pn";
    note.textContent = issue.suggestionStatus === "AMBIGUOUS" ? "Аль нь зөв бэ?" : "Зөв хувилбар";
    pop.append(note);
    const row = document.createElement("div"); row.className = "psug";
    issue.suggestions.slice(0, MAX_SUGS).forEach((s) => row.append(btn(sugLabel(s), () => applyFix(issue, s), "sm")));
    pop.append(row);
    const same = issues.filter((x) => x.normalizedToken === issue.normalizedToken && x.verdict === "MISSPELLED" && x.suggestionStatus === "CONFIDENT");
    if (bad && issue.suggestionStatus === "CONFIDENT" && same.length > 1) {
      pop.append(btn(`Бүгдийг солих (${same.length})`, async () => {
        const rr = await api.replaceAll($("text").value, same, issue.suggestions[0]);
        if (!rr.ok) { $("stats").textContent = rr.message; return; }
        $("text").value = rr.value.text; runCheck();
      }, "sm ghost"));
    }
  } else {
    const note = document.createElement("div"); note.className = "pn";
    note.textContent = bad ? "Санал олдсонгүй" : issue.message || "Энэ үгийг танихгүй байна";
    pop.append(note);
  }
  const foot = document.createElement("div"); foot.className = "pfoot";
  const drop = (fn) => async () => { await fn(); closePop(); runCheck(); };
  foot.append(
    btn("Үл тоох", drop(() => api.ignoreOnce(issue))),
    btn("Тольд нэмэх", async () => { const r = await api.addWord(issue.token); if (!r.ok) { $("stats").textContent = r.message; return; } closePop(); runCheck(); loadDict(); }),
    btn("Алдаа мэдээлэх", async () => {
      const kind = bad ? (issue.suggestions.length ? "WRONG_SUGGESTION" : "VALID_WORD_FLAGGED") : "UNKNOWN_WORD";
      const r = await api.feedbackAdd({ kind, word: issue.token, verdict: issue.verdict, suggestion: issue.suggestions[0] || null, reasonCode: issue.reasonCode || null, ...versions });
      $("fb-msg").textContent = r.ok ? "Мэдээлэл хадгалагдлаа." : (r.message || "Хадгалж чадсангүй.");
      updateFeedbackCount(); closePop();
    }),
  );
  pop.append(foot);
  pop.hidden = false;
  const mark = $("backdrop").querySelector(`mark[data-i="${k}"]`);
  const ed = $("pop").parentElement.getBoundingClientRect();
  if (mark) {
    const r = mark.getBoundingClientRect();
    pop.style.left = `${Math.max(4, Math.min(r.left - ed.left, ed.width - pop.offsetWidth - 4))}px`;
    pop.style.top = `${r.bottom - ed.top + 4}px`;
  }
}

// Side list: compact «word → fix». Selecting a row puts the caret on the word and opens the popover.
function render() {
  const ul = $("issues");
  ul.textContent = "";
  if (!issues.length) { const li = document.createElement("li"); li.className = "note"; li.textContent = $("text").value.trim() ? "Алдаа олдсонгүй." : ""; ul.append(li); return; }
  issues.forEach((issue, k) => {
    const li = document.createElement("li");
    li.className = `row ${issue.verdict === "MISSPELLED" ? "bad" : issue.verdict === "ADVISORY" ? "adv" : "unk"}`;
    const b = document.createElement("button");
    b.type = "button"; b.className = "rowbtn";
    const w = document.createElement("span"); w.className = "w"; w.textContent = issue.token;
    b.append(w);
    if (issue.suggestions.length) {
      const f = document.createElement("span"); f.className = "fix";
      f.textContent = ` → ${issue.suggestionStatus === "AMBIGUOUS" ? issue.suggestions.slice(0, MAX_SUGS).map(sugLabel).join(" / ") : sugLabel(issue.suggestions[0])}`;
      b.append(f);
    }
    b.addEventListener("click", () => {
      const t = $("text"); t.focus(); t.setSelectionRange(issue.range.start, issue.range.end);
      const y = $("backdrop").querySelector(`mark[data-i="${k}"]`);
      if (y) y.scrollIntoView({ block: "nearest" });
      t.setSelectionRange(issue.range.start, issue.range.start);
      openPop(k);
    });
    li.append(b);
    ul.append(li);
  });
}

async function loadDict() {
  const q = ($("dict-q") && $("dict-q").value || "").trim();
  const r = q ? await api.searchWords(q) : await api.words();
  const ul = $("dict"); ul.textContent = "";
  if (!r.ok) return;
  if (!r.value.length) { const li = document.createElement("li"); li.className = "note"; li.textContent = "Хоосон байна."; ul.append(li); return; }
  for (const w of r.value) {
    const li = document.createElement("li");
    li.append(document.createTextNode(w + " "), btn("Хасах", async () => { await api.removeWord(w); loadDict(); runCheck(); }));
    ul.append(li);
  }
}

$("dict-q").addEventListener("input", () => loadDict());

async function updateFeedbackCount() {
  const r = await api.feedbackCount();
  $("fb-count").textContent = r.ok && r.value ? `(${r.value})` : "";
}
$("fb-missed").addEventListener("click", async () => {
  const word = $("fb-word").value.trim();
  const r = await api.feedbackAdd({ kind: "MISSED_MISSPELLING", word, verdict: null, suggestion: null, reasonCode: null, ...versions });
  $("fb-msg").textContent = r.ok ? "Мэдээлэл хадгалагдлаа." : "Зөвхөн нэг үг оруулна уу (өгүүлбэр биш).";
  if (r.ok) $("fb-word").value = "";
  updateFeedbackCount();
});
$("fb-export").addEventListener("click", async () => {
  const r = await api.feedbackExport();
  $("fb-msg").textContent = r.ok && r.value && r.value.saved ? "Файл хадгалагдлаа. Бидэнд илгээнэ үү." : "";
});
updateFeedbackCount();

refresh();
setInterval(refresh, 60000);
