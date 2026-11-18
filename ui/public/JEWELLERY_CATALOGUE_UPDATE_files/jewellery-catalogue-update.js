const STORAGE_KEY = "goldprince_catalogue_updates_v1";
const $ = id => document.getElementById(id);
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch (e) { return {}; }
}
function save() {
  const all = load();
  all[GROUP] = data;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  $("status").textContent = "Saved locally. Existing ORDER FORM was not changed.";
}
let all = load();
let data = all[GROUP] ? clone(all[GROUP]) : clone(INITIAL_CATALOGUE[GROUP]);
save();

/* ===== STATE ===== */
let currentUploadIndex = -1;
let currentUploadSheet = "";

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
  t._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ===== RENDER ===== */
function renderSheets() {
  const names = Object.keys(data.sheets || {});
  $("sheet").innerHTML = names.map(s =>
    `<option value="${esc(s)}">${esc(s)}</option>`
  ).join("");
  renderProducts();
}

function renderProducts() {
  const sheet = $("sheet").value;
  const products = data.sheets[sheet] || [];

  $("rows").innerHTML = products.map((p, i) => {
    const hasImage = !!(p.image && p.image.trim());
    const imgCell = hasImage
      ? `<img class="row-img" src="${esc(p.image)}" alt=""
             onerror="this.outerHTML='<span style=\\'font-size:10px;color:#999\\'>no image</span>'">`
      : `<span style="font-size:10px;color:#999">no image</span>`;
    return `
    <tr>
      <td>${i + 1}</td>
      <td><input data-k="artNo" data-i="${i}" value="${esc(p.artNo)}"></td>
      <td><input data-k="name" data-i="${i}" value="${esc(p.name)}"></td>
      <td><input data-k="heightInch" data-i="${i}" value="${esc(p.heightInch)}"></td>
      <td><input data-k="sizeMm" data-i="${i}" value="${esc(p.sizeMm)}"></td>
      <td><input data-k="weight" data-i="${i}" type="number" step="0.01" value="${esc(p.weight)}"></td>
      <td>${imgCell}</td>
      <td>
        <div class="row-actions">
          <button class="upload-btn ${hasImage ? 'replace' : ''}"
                  data-upload="${i}" data-sheet="${esc(sheet)}">
            📷 ${hasImage ? "Replace" : "Upload"}
          </button>
          <button class="danger" data-delete="${i}">DELETE</button>
        </div>
      </td>
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

  document.querySelectorAll("[data-upload]").forEach(btn => {
    btn.addEventListener("click", () => {
      currentUploadSheet = btn.dataset.sheet;
      currentUploadIndex = Number(btn.dataset.upload);
      $("imageFileInput").click();
    });
  });

  $("count").textContent = `${products.length} product(s)`;
}

/* ===== ROW-LEVEL IMAGE UPLOAD ===== */
function handleRowImageFile(file) {
  if (!file) { currentUploadIndex = -1; currentUploadSheet = ""; return; }
  if (!file.type || !file.type.startsWith("image/")) {
    showToast("❌ Please select an image file", true);
    currentUploadIndex = -1; currentUploadSheet = ""; return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showToast("❌ Image too large (max 10MB)", true);
    currentUploadIndex = -1; currentUploadSheet = ""; return;
  }
  const sheet = currentUploadSheet;
  const index = currentUploadIndex;
  const reader = new FileReader();
  reader.onload = e => {
    if (data.sheets[sheet] && data.sheets[sheet][index]) {
      data.sheets[sheet][index].image = e.target.result;
      save();
      renderProducts();
      showToast(`✅ Image set for art no. ${data.sheets[sheet][index].artNo}`);
    } else {
      showToast("❌ Product not found", true);
    }
    currentUploadIndex = -1;
    currentUploadSheet = "";
  };
  reader.onerror = () => {
    showToast("❌ Error reading image", true);
    currentUploadIndex = -1; currentUploadSheet = "";
  };
  reader.readAsDataURL(file);
}

/* ===== ADD PRODUCT ===== */
function addProduct() {
  const s = $("sheet").value;
  if (!s) return;
  data.sheets[s].push({
    artNo: "NEW", name: s, heightInch: "", sizeMm: "", weight: 0, image: ""
  });
  save();
  renderProducts();
  showToast("✅ Product added to sheet");
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
  save();
  renderSheets();
}
function resetGroup() {
  if (!confirm("Reset this catalogue group to the original supplied data?")) return;
  data = clone(INITIAL_CATALOGUE[GROUP]);
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
$("resetGroup").addEventListener("click", resetGroup);
$("downloadScript").addEventListener("click", exportJs);
$("imageFileInput").addEventListener("change", e => {
  if (e.target.files && e.target.files[0]) handleRowImageFile(e.target.files[0]);
  e.target.value = "";
});

renderSheets();