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
async function runCheck() {
  const text = $("text").value;
  const r = await api.check(text, $("unknown").checked, $("advisory") ? $("advisory").checked : false);
  if (!r.ok) { $("stats").textContent = r.message; return; }
  if (r.value.locked) return refresh();
  issues = r.value.issues;
  versions = { engineVersion: r.value.engineVersion, dataPackVersion: r.value.dataPackVersion };
  const bad = issues.filter((i) => i.verdict === "MISSPELLED").length;
  const unk = issues.filter((i) => i.verdict === "UNKNOWN").length;
  const adv = issues.filter((i) => i.verdict === "ADVISORY").length;
  $("stats").textContent = `${r.value.stats.words} үг · Алдаатай: ${bad}` + ($("unknown").checked ? ` · Тодорхойгүй: ${unk}` : "") + ($("advisory") && $("advisory").checked ? ` · Зөвлөмж: ${adv}` : "");
  $("count").textContent = issues.length ? `(${issues.length})` : "";
  paintBackdrop(text);
  render();
}
$("check").addEventListener("click", runCheck);
$("unknown").addEventListener("change", runCheck);
if ($("advisory")) $("advisory").addEventListener("change", runCheck);
$("text").addEventListener("input", () => {
  paintBackdrop($("text").value, true);
  clearTimeout(timer);
  timer = setTimeout(runCheck, 900);
});
$("text").addEventListener("scroll", () => { $("backdrop").scrollTop = $("text").scrollTop; });

// Underline layer under the textarea. `stale` hides marks while the text is being edited.
function paintBackdrop(text, stale) {
  const bd = $("backdrop");
  bd.textContent = "";
  if (stale) { bd.append(document.createTextNode(text + "\n")); return; }
  let pos = 0;
  for (const i of [...issues].sort((a, b) => a.range.start - b.range.start)) {
    if (i.range.start < pos) continue;
    bd.append(document.createTextNode(text.slice(pos, i.range.start)));
    const m = document.createElement("mark");
    m.className = i.verdict === "MISSPELLED" ? "bad" : i.verdict === "ADVISORY" ? "adv" : "unk";
    m.textContent = text.slice(i.range.start, i.range.end);
    bd.append(m);
    pos = i.range.end;
  }
  bd.append(document.createTextNode(text.slice(pos) + "\n"));
  bd.scrollTop = $("text").scrollTop;
}

const btn = (label, fn, cls) => { const b = document.createElement("button"); b.textContent = label; b.className = cls || "sm ghost"; b.addEventListener("click", fn); return b; };

function render() {
  const ul = $("issues");
  ul.textContent = "";
  issues.forEach((issue, idx) => {
    const bad = issue.verdict === "MISSPELLED";
    const adv = issue.verdict === "ADVISORY";
    const ambiguous = issue.suggestionStatus === "AMBIGUOUS";
    const li = document.createElement("li");
    li.className = `issue ${bad ? "bad" : adv ? "adv" : "unk"}`;
    const head = document.createElement("div");
    const tag = document.createElement("span");
    tag.className = `tag ${bad ? "bad" : adv ? "adv" : "unk"}`;
    tag.textContent = bad ? "Алдаатай" : adv ? "Зөвлөмж" : "Тодорхойгүй";
    const w = document.createElement("span");
    w.className = "w"; w.textContent = issue.token;
    head.append(tag, w);
    li.append(head);
    // Reason text only when the engine supplied a reason code (no invented explanations).
    if (issue.reasonCode && issue.message) {
      const m = document.createElement("div"); m.className = "m"; m.textContent = issue.message; li.append(m);
    } else if (!bad) {
      const m = document.createElement("div"); m.className = "m"; m.textContent = "Тодорхойгүй үг. Автоматаар засахгүй."; li.append(m);
    }
    const actions = document.createElement("div");
    actions.className = "actions";
    if ((bad || adv) && issue.suggestions.length) {
      const sugs = document.createElement("div"); sugs.className = "sugs";
      const lbl = document.createElement("span"); lbl.textContent = ambiguous ? "Тодорхойгүй — сонгоно уу:" : "Санал:"; sugs.append(lbl);
      issue.suggestions.forEach((s, k) => {
        const l = document.createElement("label");
        // an ambiguous list claims no best: nothing is pre-selected, the user must choose
        const r = document.createElement("input"); r.type = "radio"; r.name = `s${idx}`; r.value = s; r.checked = !ambiguous && k === 0;
        l.append(r, document.createTextNode(s === "" ? "(устгах)" : s === " " ? "(нэг зай)" : s)); sugs.append(l);
      });
      li.append(sugs);
      const pick = () => { const c = li.querySelector(`input[name="s${idx}"]:checked`); return c ? c.value : null; };
      actions.append(btn("Солих", async () => {
        const v = pick();
        if (v === null) { $("stats").textContent = "Санал сонгоно уу."; return; }
        const rr = await api.replace($("text").value, issue, v);
        if (!rr.ok) { $("stats").textContent = rr.message; return; }
        $("text").value = rr.value.text; runCheck();
      }, "sm"));
      // Replace-all only for MISSPELLED words with ONE clearly best fix, and only when the word occurs more than once.
      const same = issues.filter((x) => x.normalizedToken === issue.normalizedToken && x.verdict === "MISSPELLED" && x.suggestionStatus === "CONFIDENT");
      if (bad && !ambiguous && same.length > 1) {
        actions.append(btn(`Бүгдийг солих (${same.length})`, async () => {
          const v = pick() ?? issue.suggestions[0];
          const rr = await api.replaceAll($("text").value, same, v);
          if (!rr.ok) { $("stats").textContent = rr.message; return; }
          $("text").value = rr.value.text; runCheck();
        }));
      }
    }
    const report = async (kind) => {
      const r = await api.feedbackAdd({ kind, word: issue.token, verdict: issue.verdict, suggestion: issue.suggestions[0] || null, reasonCode: issue.reasonCode || null, ...versions });
      $("fb-msg").textContent = r.ok ? "Мэдээлэл хадгалагдлаа." : (r.message || "Хадгалж чадсангүй.");
      updateFeedbackCount();
    };
    actions.append(
      btn("Үл тоох", async () => { await api.ignoreOnce(issue); issues = issues.filter((x) => x !== issue); paintBackdrop($("text").value); render(); }),
      btn("Үргэлж үл тоох", async () => { await api.ignoreAll(issue); issues = issues.filter((x) => x.normalizedToken !== issue.normalizedToken); paintBackdrop($("text").value); render(); }),
      btn(bad ? (issue.suggestions.length ? "Буруу санал" : "Зөв үг") : "Зөв үг", () => report(bad ? (issue.suggestions.length ? "WRONG_SUGGESTION" : "VALID_WORD_FLAGGED") : "UNKNOWN_WORD")),
      btn("Тольд нэмэх", async () => { const r = await api.addWord(issue.token); if (!r.ok) { $("stats").textContent = r.message; return; } runCheck(); loadDict(); }),
    );
    li.append(actions);
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
