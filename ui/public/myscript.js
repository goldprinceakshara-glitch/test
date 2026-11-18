const DEFAULT_PARTIES = {
  "Gajanan": {address:"Bangalore", cell:"98480 12345"},
  "Anmol": {address:"Bangalore", cell:"98480 67890"},
  "Silver Emporium_HYd": {address:"Hyderabad", cell:"90000 00000"},
  "Silver Emporium_Bng": {address:"Bangalore", cell:"90000 00000"},
  "Sangeetha": {address:"Bangalore", cell:"90000 00000"},
  "Sidhivinayaka": {address:"Hyderabad", cell:"90000 00000"},
  "Navaneet": {address:"Hyderabad", cell:"90000 00000"},
  "JC": {address:"Chennai", cell:"90000 00000"},
  "Mandoth": {address:"Chennai", cell:"90000 00000"},
  "Khazana": {address:"Chennai", cell:"90000 00000"},
  "Vummidi": {address:"Chennai", cell:"90000 00000"},
  "Goyaz": {address:"Hyderabad", cell:"90000 00000"}
};



let parties = JSON.parse(localStorage.getItem("goldprince_parties") || "null") || DEFAULT_PARTIES;
let group = Object.keys(catalogue)[0];
let sheet = Object.keys(catalogue[group].sheets)[0];
let index = 0;
let order = [];
let orderNo = null;

const $ = id => document.getElementById(id);

function saveParties(){ localStorage.setItem("goldprince_parties", JSON.stringify(parties)); }

function currentProducts(){ return catalogue[group]?.sheets[sheet] || []; }

function dateFmt(v){
  if(!v) return "—";
  return new Date(v+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"}).replace(/ /g,"-");
}

function setupGroups(){
  $("productGroup").innerHTML = Object.keys(catalogue).map(g => `<option>${g}</option>`).join("");
  $("productGroup").value = group;
  populateSheets();
}

function populateSheets(){
  const sheets = Object.keys(catalogue[group].sheets);
  if(!sheets.includes(sheet)) sheet = sheets[0];
  $("catalogSheet").innerHTML = sheets.map(s => `<option>${s}</option>`).join("");
  $("catalogSheet").value = sheet;
}

function setupPartyList(){
  $("partyList").innerHTML = Object.keys(parties).sort().map(x=>`<option value="${escapeHtml(x)}"></option>`).join("");
  renderPartyMaster();
}

function escapeHtml(v){
  return String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function lookupParty(){
  const name = $("partyName").value.trim();
  const p = parties[name];
  if(p){
    $("address").value = p.address;
    $("cellNo").value = p.cell;
  }
  syncMeta();
}

function setOrderNumber(){
  orderNo = nextOrderNumber(group);
  $("orderNumberPreview").textContent = "ORDER NO. " + orderNo;
}

function nextOrderNumber(g){
  const key = "orderCounter_"+g;
  const stored = Number(localStorage.getItem(key));
  return stored && stored >= catalogue[g].orderStart ? stored : catalogue[g].orderStart;
}

function consumeOrderNumber(){
  localStorage.setItem("orderCounter_"+group, String(orderNo + 1));
}

function renderArtBox(){
  const ps = currentProducts();
  $("artNoBox").innerHTML = ps.map((p,i)=>
    `<button class="art-chip ${i===index?'active':''}" data-index="${i}">${escapeHtml(p.artNo)}</button>`
  ).join("");
  document.querySelectorAll(".art-chip").forEach(btn => {
    btn.addEventListener("click", () => selectProduct(Number(btn.dataset.index)));
  });
}

function showProduct(){
  const ps = currentProducts();
  if(!ps.length) return;
  if(index >= ps.length) index = 0;
  const p = ps[index];

  $("catalogImage").src = p.image;
  $("catalogImage").classList.remove("hidden");
  $("imageFallback").classList.add("hidden");
  $("catalogImage").onerror = () => {
    $("catalogImage").classList.add("hidden");
    $("imageFallback").classList.remove("hidden");
    $("missingImageName").textContent = p.image;
  };

  $("detailArtNo").textContent = p.artNo;
  $("detailName").textContent = p.name;
  $("detailInch").textContent = p.heightInch + (String(p.heightInch).match(/^\d/) ? " inch" : "");
  $("detailMm").textContent = p.sizeMm + " mm";
  $("detailWeight").textContent = Number(p.weight).toFixed(2) + " g";
  $("detailGroup").textContent = group;
  $("slideCounter").textContent = `${index + 1} / ${ps.length}`;
  $("quantity").value = 1;
  renderArtBox();
}

function selectProduct(i){ index = i; showProduct(); }

function slideProduct(dir){
  const ps = currentProducts();
  if(!ps.length) return;
  index = (index + dir + ps.length) % ps.length;
  showProduct();
}

function changeGroup(){
  group = $("productGroup").value;
  sheet = Object.keys(catalogue[group].sheets)[0];
  index = 0;
  order = [];
  populateSheets();
  setOrderNumber();
  $("groupPill").textContent = group;
  showProduct();
  renderOrder();
  syncMeta();
}

function changeSheet(){
  sheet = $("catalogSheet").value;
  index = 0;
  showProduct();
}

function addSelectedProduct(){
  const p = currentProducts()[index];
  if(!p) return;
  const qty = Math.max(1, parseInt($("quantity").value) || 1);
  const key = group + "|" + sheet + "|" + p.artNo;
  const old = order.find(x => x.key === key);
  if(old) old.qty += qty;
  else order.push({...p, qty, key, group, sheet});
  renderOrder();
}

function removeItem(i){ order.splice(i,1); renderOrder(); }

function renderOrder(){
  $("orderBody").innerHTML = order.map((p,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${escapeHtml(p.artNo)}</td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.heightInch)} inch</td>
      <td>${escapeHtml(p.sizeMm)} mm</td>
      <td>${p.qty}</td>
      <td>${Number(p.weight).toFixed(2)}</td>
      <td>${(p.qty*p.weight).toFixed(2)}</td>
      <td><img class="order-img" src="${escapeHtml(p.image)}" alt=""></td>
      <td class="no-print"><button class="remove" data-remove="${i}">REMOVE</button></td>
    </tr>`).join("");

  document.querySelectorAll("[data-remove]").forEach(btn =>
    btn.addEventListener("click", () => removeItem(Number(btn.dataset.remove)))
  );

  const qty = order.reduce((s,p)=>s+p.qty,0);
  const wt = order.reduce((s,p)=>s+p.qty*p.weight,0);
  $("totalQty").textContent = qty;
  $("totalWeight").textContent = wt.toFixed(2);
}

function syncMeta(){
  $("metaParty").textContent = $("partyName").value || "—";
  $("metaAddress").textContent = $("address").value || "—";
  $("metaCell").textContent = $("cellNo").value || "—";
  $("metaGroup").textContent = group;
  $("notePreview").textContent = $("note").value || "—";
}

function newOrder(){
  if(!confirm("Start a new order? The current order will be cleared.")) return;
  if(order.length) consumeOrderNumber();
  order = [];
  setOrderNumber();
  $("estimateNo").value = "";
  $("note").value = "";
  renderOrder();
  syncMeta();
}

function saveParty(){
  const name = $("masterPartyName").value.trim();
  const address = $("masterAddress").value.trim();
  const cell = $("masterCell").value.trim();
  if(!name){ alert("Enter a party name."); return; }
  parties[name] = {address, cell};
  saveParties();
  setupPartyList();
  $("partyName").value = name;
  lookupParty();
  $("masterPartyName").value = "";
  $("masterAddress").value = "";
  $("masterCell").value = "";
}

function renderPartyMaster(){
  $("partyMasterList").innerHTML = Object.keys(parties).sort().map(name => {
    const p = parties[name];
    return `<div class="party-row">
      <strong>${escapeHtml(name)}</strong>
      <span>${escapeHtml(p.address)}</span><br>
      <span>${escapeHtml(p.cell)}</span><br>
      <button data-load-party="${escapeHtml(name)}">EDIT</button>
      <button data-delete-party="${escapeHtml(name)}">DELETE</button>
    </div>`;
  }).join("");

  document.querySelectorAll("[data-load-party]").forEach(btn => btn.addEventListener("click", () => {
    const p = parties[btn.dataset.loadParty];
    $("masterPartyName").value = btn.dataset.loadParty;
    $("masterAddress").value = p.address;
    $("masterCell").value = p.cell;
  }));

  document.querySelectorAll("[data-delete-party]").forEach(btn => btn.addEventListener("click", () => {
    if(!confirm(`Delete party "${btn.dataset.deleteParty}"?`)) return;
    delete parties[btn.dataset.deleteParty];
    saveParties();
    setupPartyList();
  }));
}

function downloadPDF(){
  if(!order.length){ alert("Add at least one product."); return; }
  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  doc.setFillColor(247,203,168); doc.rect(8,8,281,9,"F");
  doc.setFont(undefined,"bold"); doc.setFontSize(16); doc.setTextColor(90,45,125);
  doc.text(group+" ORDER FORM",148.5,14,{align:"center"});
  doc.setTextColor(0,0,0); doc.setFontSize(9); doc.setFont(undefined,"normal");
  doc.text("ORDER NO. "+orderNo,250,23);
  doc.text("PARTY: "+$("partyName").value,10,23);
  doc.text("ADDRESS: "+$("address").value,10,28);
  doc.text("CELL: "+$("cellNo").value,10,33);
  doc.text("TOUCH: "+$("touch").value,10,38);
  doc.text("ESTIMATION NO: "+$("estimateNo").value,145,28);
  doc.text("EST. DATE: "+dateFmt($("estimateDate").value),145,33);
  doc.text("APPROX DELIVERY: "+dateFmt($("deliveryDate").value),145,38);

  const rows = order.map((p,i)=>[
    i+1,p.artNo,p.name,p.heightInch+" in",p.sizeMm+" mm",p.qty,
    Number(p.weight).toFixed(2),(p.qty*p.weight).toFixed(2)
  ]);

  doc.autoTable({
    startY:43,
    head:[["SL NO","ART NO","PRODUCT NAME","HEIGHT","SIZE MM","ORDER QTY","AVG WT","TOTAL WT"]],
    body:rows,
    foot:[["","","","","TOTAL:",$("totalQty").textContent,"",$("totalWeight").textContent]],
    styles:{fontSize:7,cellPadding:2,halign:"center"},
    headStyles:{fillColor:[245,245,245],textColor:[0,0,0]},
    footStyles:{fontStyle:"bold",textColor:[0,0,0]}
  });

  const y = doc.lastAutoTable.finalY + 8;
  doc.setFont(undefined,"bold"); doc.setTextColor(130,30,30);
  doc.text("NOTE: "+($("note").value||"—"),10,y);
  doc.setTextColor(0,0,0);
  doc.save(`${group.replaceAll(" ","_")}_Order_${orderNo}.pdf`);
}

function downloadExcel(){
  if(!order.length){ alert("Add at least one product."); return; }
  const info = [
    ["ORDER FORM",group],
    ["ORDER NO.",orderNo],
    ["PARTY NAME",$("partyName").value],
    ["ADDRESS",$("address").value],
    ["CELL NO.",$("cellNo").value],
    ["PRODUCT GROUP",group],
    ["CATALOGUE SHEET",sheet],
    ["TOUCH",$("touch").value],
    ["ESTIMATION NO.",$("estimateNo").value],
    ["ESTIMATION DATE",dateFmt($("estimateDate").value)],
    ["APPROX DELIVERY DATE",dateFmt($("deliveryDate").value)],
    ["NOTE",$("note").value],
    []
  ];

  const rows = order.map((p,i)=>({
    "SL NO":i+1,
    "ART NO":p.artNo,
    "PRODUCT NAME":p.name,
    "HEIGHT / SIZE (INCH)":p.heightInch,
    "SIZE (MM)":p.sizeMm,
    "ORDER QTY":p.qty,
    "AVG WT (g)":p.weight,
    "TOTAL WT (g)":+(p.qty*p.weight).toFixed(2),
    "IMAGE":p.image
  }));

  rows.push({
    "SL NO":"","ART NO":"","PRODUCT NAME":"","HEIGHT / SIZE (INCH)":"",
    "SIZE (MM)":"TOTAL:","ORDER QTY":+$("totalQty").textContent,
    "AVG WT (g)":"","TOTAL WT (g)":+$("totalWeight").textContent,"IMAGE":""
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(info),"Order Info");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Order Details");
  XLSX.writeFile(wb,`${group.replaceAll(" ","_")}_Order_${orderNo}.xlsx`);
}

$("partyName").addEventListener("input", lookupParty);
$("partyName").addEventListener("change", lookupParty);
$("productGroup").addEventListener("change", changeGroup);
$("catalogSheet").addEventListener("change", changeSheet);
$("prevBtn").addEventListener("click", () => slideProduct(-1));
$("nextBtn").addEventListener("click", () => slideProduct(1));
$("addBtn").addEventListener("click", addSelectedProduct);
$("savePartyBtn").addEventListener("click", saveParty);
$("savePdfBtn").addEventListener("click", downloadPDF);
$("saveExcelBtn").addEventListener("click", downloadExcel);
$("printBtn").addEventListener("click", () => window.print());
$("newOrderBtn").addEventListener("click", newOrder);
["address","cellNo","touch","deliveryDate","note"].forEach(id => {
  $(id).addEventListener("input", syncMeta);
  $(id).addEventListener("change", syncMeta);
});

document.addEventListener("keydown", e => {
  if(e.key === "ArrowLeft") slideProduct(-1);
  if(e.key === "ArrowRight") slideProduct(1);
});

$("estimateDate").value = new Date().toISOString().slice(0,10);
setupGroups();
setupPartyList();
setOrderNumber();
showProduct();
renderOrder();
syncMeta();

