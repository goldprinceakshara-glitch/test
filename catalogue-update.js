/* GOLDPRINCE CATALOGUE UPDATE — shared by 3D / 2D / GOD FRAMES */
const STORAGE_KEY = "goldprince_catalogue_updates_v1";
const $ = id => document.getElementById(id);
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch (e) { return {}; }
}
function save() {
  if (!data.sheetImages) data.sheetImages = {};
  Object.entries(data.sheetImages).forEach(([sheetName, img]) => {
    if (!img) return;
    (data.sheets[sheetName] || []).forEach(p => { p.image = img; });
  });

  // 1. Save the editor's canonical copy (this is what ORDER FORM reads as overlay)
  const all = load();
  all[GROUP] = data;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    showToast("❌ Storage full or blocked. Serve this page over http:// not file://", true);
    return;
  }

  // 2. Mirror this group into the shared 'goldprince_catalogue' key so
  //    anything that reads only that key (older ORDER FORM builds, exports,
  //    other tools) sees the latest data.
  try {
    var SHARED_KEY = 'goldprince_catalogue';
    var shared = {};
    try { shared = JSON.parse(localStorage.getItem(SHARED_KEY) || '{}') || {}; } catch (e2) { shared = {}; }
    shared[GROUP] = data;
    localStorage.setItem(SHARED_KEY, JSON.stringify(shared));
  } catch (e3) {
    // non-fatal — overlay save already succeeded
    console.warn('[catalogue-update.js] mirror to goldprince_catalogue failed:', e3);
  }

  // 3. Also mirror to the group-specific key (belt & suspenders)
  try {
    var GRP_KEY = 'goldprince_catalogue_' + GROUP.replace(/\s+/g, '_');
    var only = {};
    only[GROUP] = data;
    localStorage.setItem(GRP_KEY, JSON.stringify(only));
  } catch (e4) { /* non-fatal */ }

  const s = $("status");
  if (s) s.textContent = "Saved locally. ORDER FORM will read this data.";
}
let all = load();
let data = all[GROUP] ? clone(all[GROUP]) : clone(INITIAL_CATALOGUE[GROUP]);
if (!data.sheetImages) data.sheetImages = {};
save();

/* ===== SHEET IMAGE HELPERS ===== */
function getSheetImage(sheetName) {
  if (data.sheetImages && data.sheetImages[sheetName]) return data.sheetImages[sheetName];
  const list = data.sheets[sheetName] || [];
  const first = list.find(p => p.image && p.image.trim());
  return first ? first.image : "";
}
function setSheetImage(sheetName, dataUrl) {
  if (!data.sheetImages) data.sheetImages = {};
  data.sheetImages[sheetName] = dataUrl;
  (data.sheets[sheetName] || []).forEach(p => { p.image = dataUrl; });
}
function clearSheetImage(sheetName) {
  if (data.sheetImages) delete data.sheetImages[sheetName];
  (data.sheets[sheetName] || []).forEach(p => { p.image = ""; });
}

/* ===== HELPERS ===== */
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function showToast(msg, isError) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.toggle("error", !!isError);
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 3500);
}

/* ===== RENDER ===== */
function renderSheets() {
  const names = Object.keys(data.sheets || {});
  $("sheet").innerHTML = names.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  renderProducts();
}
function renderSheetImagePanel() {
  const sheet = $("sheet").value;
  const img = getSheetImage(sheet);
  const preview = $("sheetPreview"), noImg = $("noSheetImg");
  $("sheetImageName").textContent = sheet || "—";
  if (img) {
    preview.src = img;
    preview.style.display = "block";
    noImg.style.display = "none";
    $("removeSheetImage").disabled = false;
  } else {
    preview.removeAttribute("src");
    preview.style.display = "none";
    noImg.style.display = "block";
    $("removeSheetImage").disabled = true;
  }
}
function renderProducts() {
  const sheet = $("sheet").value;
  const products = data.sheets[sheet] || [];
  const sheetImg = getSheetImage(sheet);

  $("rows").innerHTML = products.map((p, i) => {
    const imgCell = sheetImg
      ? `<img class="row-img" src="${esc(sheetImg)}" alt="" onerror="this.outerHTML='<span style=\\'font-size:10px;color:#999\\'>no image</span>'">`
      : `<span style="font-size:10px;color:#999">no image</span>`;
    return `
    <tr data-row="${i}">
      <td>${i + 1}</td>
      <td><input data-k="artNo" data-i="${i}" value="${esc(p.artNo)}"></td>
      <td><input data-k="name" data-i="${i}" value="${esc(p.name)}"></td>
      <td><input data-k="heightInch" data-i="${i}" value="${esc(p.heightInch)}"></td>
      <td><input data-k="sizeMm" data-i="${i}" value="${esc(p.sizeMm)}"></td>
      <td><input data-k="weight" data-i="${i}" type="number" step="0.01" value="${esc(p.weight)}"></td>
      <td>${imgCell}</td>
      <td><button class="danger" data-delete="${i}">Delete</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="8">No products in this sheet.</td></tr>`;

  document.querySelectorAll("[data-k]").forEach(el => {
    el.addEventListener("change", () => {
      const i = Number(el.dataset.i);
      const k = el.dataset.k;
      data.sheets[sheet][i][k] = k === "weight" ? (Number(el.value) || 0) : el.value;
      save();
    });
  });
  document.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!confirm("Delete this catalogue item?")) return;
      data.sheets[sheet].splice(Number(btn.dataset.delete), 1);
      save();
      renderProducts();
    });
  });
  $("count").textContent = `${products.length} product(s)`;
  renderSheetImagePanel();
}

/* ===== SHEET IMAGE UPLOAD ===== */
function uploadSheetImage() {
  if (!$("sheet").value) { showToast("❌ No sheet selected", true); return; }
  $("imageFileInput").click();
}
function handleSheetImageFile(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith("image/")) {
    showToast("❌ Please select an image file", true); return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast("❌ Image too large (max 10MB)", true); return;
  }
  const sheet = $("sheet").value;
  const reader = new FileReader();
  reader.onload = e => {
    setSheetImage(sheet, e.target.result);
    save();
    renderProducts();
    renderSheetImagePanel();
    showToast(`✅ Image successfully uploaded for sheet "${sheet}"`);
  };
  reader.onerror = () => showToast("❌ Error reading image", true);
  reader.readAsDataURL(file);
}
function removeSheetImage() {
  const sheet = $("sheet").value;
  if (!sheet) return;
  if (!confirm(`Remove image for sheet "${sheet}"?`)) return;
  clearSheetImage(sheet);
  save();
  renderProducts();
  renderSheetImagePanel();
  showToast("🗑 Sheet image removed");
}

/* ===== ADD PRODUCT (scroll + focus + highlight) ===== */
function addProduct() {
  const s = $("sheet").value;
  if (!s) { showToast("❌ No sheet selected", true); return; }
  const sheetImg = getSheetImage(s);
  const newIndex = data.sheets[s].length;
  data.sheets[s].push({
    artNo: "NEW",
    name: s,
    heightInch: "",
    sizeMm: "",
    weight: 0,
    image: sheetImg || ""
  });
  save();
  renderProducts();
  showToast("✅ Product added. Edit Art No. and details below.");

  setTimeout(() => {
    const tr = document.querySelector(`tr[data-row="${newIndex}"]`);
    if (tr) {
      tr.classList.add("row-new");
      tr.scrollIntoView({ behavior: "smooth", block: "center" });
      const artInput = tr.querySelector(`[data-k="artNo"]`);
      if (artInput) { artInput.focus(); artInput.select(); }
      setTimeout(() => tr.classList.remove("row-new"), 1800);
    }
  }, 60);
}

/* ===== SHEET MANAGEMENT ===== */
function addSheet() {
  const n = prompt("Enter new catalogue sheet / product name:");
  if (!n) return;
  if (data.sheets[n]) { alert("That sheet already exists."); return; }
  data.sheets[n] = [];
  save();
  renderSheets();
  $("sheet").value = n;
  renderProducts();
}
function deleteSheet() {
  const s = $("sheet").value;
  if (Object.keys(data.sheets).length <= 1) { alert("At least one sheet must remain."); return; }
  if (!confirm(`Delete sheet "${s}" and all its products?`)) return;
  delete data.sheets[s];
  if (data.sheetImages) delete data.sheetImages[s];
  save();
  renderSheets();
}
function resetGroup() {
  if (!confirm("Reset this catalogue group to the original supplied data?")) return;
  data = clone(INITIAL_CATALOGUE[GROUP]);
  if (!data.sheetImages) data.sheetImages = {};
  save();
  renderSheets();
}
function exportJs() {
  const text = "const catalogue = " + JSON.stringify({ [GROUP]: data }, null, 2) + ";";
  const blob = new Blob([text], { type: "text/javascript" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = GROUP.replaceAll(" ", "_") + "_catalogue.js";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ===== EVENTS ===== */
$("sheet").addEventListener("change", renderProducts);
$("addProduct").addEventListener("click", addProduct);
$("addSheet").addEventListener("click", addSheet);
$("deleteSheet").addEventListener("click", deleteSheet);
// resetGroup and downloadScript buttons have been removed from HTML —
// bind only if they exist so this shared script stays safe across pages.
if ($("resetGroup")) $("resetGroup").addEventListener("click", resetGroup);
if ($("downloadScript")) $("downloadScript").addEventListener("click", exportJs);
$("uploadSheetImage").addEventListener("click", uploadSheetImage);
$("removeSheetImage").addEventListener("click", removeSheetImage);
$("imageFileInput").addEventListener("change", e => {
  if (e.target.files && e.target.files[0]) handleSheetImageFile(e.target.files[0]);
  e.target.value = "";
});

(function setupSheetDragDrop() {
  const box = document.querySelector(".sheet-image-box");
  if (!box) return;
  ["dragenter", "dragover", "dragleave", "drop"].forEach(ev =>
    box.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); })
  );
  box.addEventListener("dragover", () => { box.style.outline = "3px dashed #0d6f73"; });
  box.addEventListener("dragleave", () => { box.style.outline = ""; });
  box.addEventListener("drop", e => {
    box.style.outline = "";
    const file = e.dataTransfer.files[0];
    if (file) handleSheetImageFile(file);
  });
})();

renderSheets();
// one-time seed on first load
(function seedCatalogue() {
  var KEY = 'goldprince_catalogue';
  var existing = null;
  try { existing = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!existing || typeof existing !== 'object' || !Object.keys(existing).length) {
    try { localStorage.setItem(KEY, JSON.stringify(INITIAL_CATALOGUE)); } catch (e) {}
  }
})();