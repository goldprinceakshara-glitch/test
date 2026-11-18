// GoldPrince Order Workflow
const catalogue = {
  "3D IDOLS": {
    orderStart: 4001,
    sheets: {
      "PADMAM GANESH": [
        {artNo:"111916", name:"PADMAM GANESH", heightInch:"0.8", sizeMm:"20", weight:6, image:"images/PADMAM GANESH.jpg"},
        {artNo:"111915", name:"PADMAM GANESH", heightInch:"1.1", sizeMm:"28", weight:16, image:"images/PADMAM GANESH.jpg"},
        {artNo:"111914", name:"PADMAM GANESH", heightInch:"1.4", sizeMm:"35", weight:17, image:"images/PADMAM GANESH.jpg"},
        {artNo:"111913", name:"PADMAM GANESH", heightInch:"1.6", sizeMm:"40", weight:23, image:"images/PADMAM GANESH.jpg"},
        {artNo:"111912", name:"PADMAM GANESH", heightInch:"2.2", sizeMm:"55", weight:57, image:"images/PADMAM GANESH.jpg"},
        {artNo:"111911", name:"PADMAM GANESH", heightInch:"2.8", sizeMm:"70", weight:100, image:"images/PADMAM GANESH.jpg"},
        {artNo:"111910", name:"PADMAM GANESH", heightInch:"3.7", sizeMm:"95", weight:213, image:"images/PADMAM GANESH.jpg"},
        {artNo:"111909", name:"PADMAM GANESH", heightInch:"4.4", sizeMm:"112", weight:307, image:"images/PADMAM GANESH.jpg"},
        {artNo:"111908", name:"PADMAM GANESH", heightInch:"5.1", sizeMm:"130", weight:451, image:"images/PADMAM GANESH.jpg"},
        {artNo:"109942", name:"PADMAM GANESH", heightInch:"5.9", sizeMm:"150", weight:594, image:"images/PADMAM GANESH.jpg"},
        {artNo:"108003", name:"PADMAM GANESH", heightInch:"6.9", sizeMm:"175", weight:1000, image:"images/PADMAM GANESH.jpg"},
        {artNo:"108004", name:"PADMAM GANESH", heightInch:"7.6", sizeMm:"195", weight:1500, image:"images/PADMAM GANESH.jpg"},
        {artNo:"109422", name:"PADMAM GANESH", heightInch:"7.7", sizeMm:"196", weight:1550, image:"images/PADMAM GANESH.jpg"},
        {artNo:"107685", name:"PADMAM GANESH", heightInch:"9.0", sizeMm:"228", weight:2000, image:"images/PADMAM GANESH.jpg"},
        {artNo:"108005", name:"PADMAM GANESH", heightInch:"10.2", sizeMm:"260", weight:2500, image:"images/PADMAM GANESH.jpg"},
        {artNo:"106178", name:"PADMAM GANESH", heightInch:"12.0", sizeMm:"304", weight:6000, image:"images/PADMAM GANESH.jpg"}

      ],
      "PADMAM LAKSHMI": [
        {artNo:"113572", name:"PADMAM LAKSHMI", heightInch:"0.8", sizeMm:"20", weight:7, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"112259", name:"PADMAM LAKSHMI", heightInch:"1.1", sizeMm:"28", weight:17, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"112258", name:"PADMAM LAKSHMI", heightInch:"1.4", sizeMm:"35", weight:18, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"112257", name:"PADMAM LAKSHMI", heightInch:"1.6", sizeMm:"40", weight:25, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"112256", name:"PADMAM LAKSHMI", heightInch:"2.2", sizeMm:"55", weight:61, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"112255", name:"PADMAM LAKSHMI", heightInch:"2.8", sizeMm:"70", weight:107, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"114569", name:"PADMAM LAKSHMI", heightInch:"3.3", sizeMm:"83", weight:164, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"112254", name:"PADMAM LAKSHMI", heightInch:"3.7", sizeMm:"95", weight:223, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"112253", name:"PADMAM LAKSHMI", heightInch:"4.4", sizeMm:"112", weight:336, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"112252", name:"PADMAM LAKSHMI", heightInch:"5.1", sizeMm:"130", weight:448, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"106238", name:"PADMAM LAKSHMI", heightInch:"5.9", sizeMm:"150", weight:854, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"106239", name:"PADMAM LAKSHMI", heightInch:"7.0", sizeMm:"180", weight:1577, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"109439", name:"PADMAM LAKSHMI", heightInch:"7.7", sizeMm:"195", weight:1550, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"107720", name:"PADMAM LAKSHMI", heightInch:"8.9", sizeMm:"228", weight:1900, image:"images/PADMAM LAKSHMI.jpg"},
        {artNo:"106177", name:"PADMAM LAKSHMI", heightInch:"11.8", sizeMm:"300", weight:6000, image:"images/PADMAM LAKSHMI.jpg"}
      ],
      "SARASWATHI": [
        {artNo:"112031", name:"SARASWATHI", heightInch:"0.8", sizeMm:"20", weight:6, image:"images/SARASWATHI.jpg"},
        {artNo:"112030", name:"SARASWATHI", heightInch:"1.1", sizeMm:"28", weight:18, image:"images/SARASWATHI.jpg"},
        {artNo:"112029", name:"SARASWATHI", heightInch:"1.4", sizeMm:"35", weight:27, image:"images/SARASWATHI.jpg"},
        {artNo:"112028", name:"SARASWATHI", heightInch:"1.6", sizeMm:"40", weight:27, image:"images/SARASWATHI.jpg"},
        {artNo:"112027", name:"SARASWATHI", heightInch:"2.2", sizeMm:"55", weight:64, image:"images/SARASWATHI.jpg"},
        {artNo:"112026", name:"SARASWATHI", heightInch:"2.8", sizeMm:"70", weight:120, image:"images/SARASWATHI.jpg"},
        {artNo:"112025", name:"SARASWATHI", heightInch:"3.7", sizeMm:"95", weight:242, image:"images/SARASWATHI.jpg"},
        {artNo:"112024", name:"SARASWATHI", heightInch:"4.4", sizeMm:"112", weight:375, image:"images/SARASWATHI.jpg"},
        {artNo:"112023", name:"SARASWATHI", heightInch:"5.1", sizeMm:"130", weight:542, image:"images/SARASWATHI.jpg"},
        {artNo:"106242", name:"SARASWATHI", heightInch:"5.9", sizeMm:"150", weight:936, image:"images/SARASWATHI.jpg"},
        {artNo:"106243", name:"SARASWATHI", heightInch:"7.0", sizeMm:"180", weight:1140, image:"images/SARASWATHI.jpg"},
        {artNo:"109439", name:"SARASWATHI", heightInch:"7.7", sizeMm:"195", weight:1550, image:"images/SARASWATHI.jpg"},
        {artNo:"113509", name:"SARASWATHI", heightInch:"9.0", sizeMm:"228", weight:2100, image:"images/SARASWATHI.jpg"}
      ]
    }
  },

  "2D IDOLS": {
    orderStart: 851,
    sheets: {
      "PANCHAMUKHA GANESH": [
        {artNo:"112869", name:"PANCHAMUKHA GANESH", heightInch:"1.5", sizeMm:"38", weight:16, image:"images/2D PANCHAMUKHA GANESH.jpg"},
        {artNo:"112870", name:"PANCHAMUKHA GANESH", heightInch:"2.5", sizeMm:"63", weight:59, image:"images/2D PANCHAMUKHA GANESH.jpg"},
        {artNo:"112856", name:"PANCHAMUKHA GANESH", heightInch:"3.5", sizeMm:"89", weight:123, image:"images/2D PANCHAMUKHA GANESH.jpg"}
      ],
      "PANCHAMUKHA HANUMAN": [
        {artNo:"112238", name:"PANCHAMUKHA HANUMAN", heightInch:"1.0", sizeMm:"25", weight:6, image:"images/2D PANCHAMUKHA HANUMAN-2.jpg"},
        {artNo:"112237", name:"PANCHAMUKHA HANUMAN", heightInch:"1.4", sizeMm:"35", weight:12, image:"images/2D PANCHAMUKHA HANUMAN-2.jpg"},
        {artNo:"112236", name:"PANCHAMUKHA HANUMAN", heightInch:"1.8", sizeMm:"45", weight:23, image:"images/2D PANCHAMUKHA HANUMAN-2.jpg"},
        {artNo:"112235", name:"PANCHAMUKHA HANUMAN", heightInch:"2.2", sizeMm:"55", weight:40, image:"images/2D PANCHAMUKHA HANUMAN-2.jpg"},
        {artNo:"112234", name:"PANCHAMUKHA HANUMAN", heightInch:"2.6", sizeMm:"65", weight:60, image:"images/2D PANCHAMUKHA HANUMAN-2.jpg"}
      ]
    }
  },

  "JEWELLERY": {
    orderStart: 8004,
    sheets: {
      "REGULAR": [
        {artNo:"8001", name:"PENDANT", heightInch:"", sizeMm:"", weight:54, image:"images/8001.jpg"},
        {artNo:"8002", name:"PENDANT", heightInch:"", sizeMm:"", weight:60, image:"images/8002.jpg"},
        {artNo:"8008", name:"HARAM", heightInch:"", sizeMm:"", weight:156, image:"images/8008.jpg"},
        {artNo:"8204", name:"NECKLACE", heightInch:"", sizeMm:"", weight:107, image:"images/8204.jpg"}
      ],
      "PREMIUM NAGAS": [
        {artNo:"89491", name:"NECKLACE", heightInch:"", sizeMm:"", weight:73, image:"images/89491.jpg"},
        {artNo:"8002", name:"PENDANT", heightInch:"", sizeMm:"", weight:60, image:"images/8002.jpg"},
        {artNo:"90289", name:"NECKLACE", heightInch:"", sizeMm:"", weight:132, image:"images/90289.jpg"},
        {artNo:"90168", name:"NECKLACE", heightInch:"", sizeMm:"", weight:96, image:"images/8204.jpg"}
      ],
      "GATTI": [
        {artNo:"111196", name:"JIGINI", heightInch:"", sizeMm:"", weight:22, image:"images/111196.jpg"},
        {artNo:"111198", name:"JIGINI", heightInch:"", sizeMm:"", weight:23, image:"images/111198.jpg"}
        
      ],
      "GJ": [
        {artNo:"8001", name:"PENDANT", heightInch:"", sizeMm:"", weight:54, image:"images/8001.jpg"},
        {artNo:"8002", name:"PENDANT", heightInch:"", sizeMm:"", weight:60, image:"images/8002.jpg"},
        {artNo:"8008", name:"HARAM", heightInch:"", sizeMm:"", weight:156, image:"images/8008.jpg"},
        {artNo:"8204", name:"NECKLACE", heightInch:"", sizeMm:"", weight:107, image:"images/8204.jpg"}
      ],
      "PREMIUM JADAU KUNDAN": [
        {artNo:"8001", name:"PENDANT", heightInch:"", sizeMm:"", weight:54, image:"images/8001.jpg"},
        {artNo:"8002", name:"PENDANT", heightInch:"", sizeMm:"", weight:60, image:"images/8002.jpg"},
        {artNo:"8008", name:"HARAM", heightInch:"", sizeMm:"", weight:156, image:"images/8008.jpg"},
        {artNo:"8204", name:"NECKLACE", heightInch:"", sizeMm:"", weight:107, image:"images/8204.jpg"}
      ]
    }
  },

  "GOD FRAMES": {
    orderStart: 1001,
    sheets: {
      "PADMAM GANESH": [
        {artNo:"62039", name:"PADMAM GANESH", heightInch:"2.2", sizeMm:"A", weight:10, image:"images/F-PADMAM GANESH.jpg"},
        {artNo:"62071", name:"PADMAM GANESH", heightInch:"2.7", sizeMm:"N", weight:25, image:"images/F-PADMAM GANESH.jpg"},
        {artNo:"62212", name:"PADMAM GANESH", heightInch:"3.7", sizeMm:"B", weight:35, image:"images/F-PADMAM GANESH.jpg"},
        {artNo:"62000", name:"PADMAM GANESH", heightInch:"4.4", sizeMm:"B", weight:35, image:"images/F-PADMAM GANESH.jpg"},
        {artNo:"62178", name:"PADMAM GANESH", heightInch:"5.9", sizeMm:"AB", weight:82, image:"images/F-PADMAM GANESH.jpg"}
        
      ],
      "PADMAM LAKSHMI": [
        {artNo:"62040", name:"PADMAM LAKSHMI", heightInch:"2.2", sizeMm:"A", weight:10, image:"images/F-PADMAM LAKSHMI.jpg"},
        {artNo:"62055", name:"PADMAM LAKSHMI", heightInch:"2.7", sizeMm:"N", weight:25, image:"images/F-PADMAM LAKSHMI.jpg"},
        {artNo:"62213", name:"PADMAM LAKSHMI", heightInch:"3.7", sizeMm:"B", weight:35, image:"images/F-PADMAM LAKSHMI.jpg"},
        {artNo:"62001", name:"PADMAM LAKSHMI", heightInch:"4.4", sizeMm:"B", weight:35, image:"images/F-PADMAM LAKSHMI.jpg"},
        {artNo:"62179", name:"PADMAM LAKSHMI", heightInch:"5.9", sizeMm:"AB", weight:82, image:"images/F-PADMAM LAKSHMI.jpg"}
        
      ],
      "SARASWATHI": [
        {artNo:"62041", name:"PADMAM GANESH", heightInch:"2.2", sizeMm:"A", weight:10, image:"images/GOD-FRAME-SAMPLE.jpg"},
        {artNo:"62073", name:"PADMAM GANESH", heightInch:"2.7", sizeMm:"N", weight:25, image:"images/GOD-FRAME-SAMPLE.jpg"},
        {artNo:"62214", name:"PADMAM GANESH", heightInch:"3.7", sizeMm:"B", weight:35, image:"images/GOD-FRAME-SAMPLE.jpg"},
        {artNo:"62002", name:"PADMAM GANESH", heightInch:"4.4", sizeMm:"B", weight:35, image:"images/GOD-FRAME-SAMPLE.jpg"},
        {artNo:"62180", name:"PADMAM GANESH", heightInch:"5.9", sizeMm:"AB", weight:82, image:"images/GOD-FRAME-SAMPLE.jpg"}
        
      ]
    }
  }
};
const KEYS={parties:"goldprince_parties",estimates:"goldprince_estimation_counter",orders:"goldprince_orders"};
let parties={},group="3D IDOLS",sheet="",index=0,order=[],confirmedOrder=null,selectedShopOrder=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const dateFmt=v=>{if(!v)return"—";return new Date(v+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"2-digit",year:"numeric"});};
const today=()=>new Date().toISOString().slice(0,10);
const loadJSON=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||"null")??f}catch{return f}};
const saveOrders=a=>localStorage.setItem(KEYS.orders,JSON.stringify(a));
const getOrders=()=>loadJSON(KEYS.orders,[]);
const products=()=>catalogue[group]?.sheets[sheet]||[];

function setupOrder(){
 parties={...loadJSON(KEYS.parties,{}),...loadJSON("gp_party_master",{})};
 group="3D IDOLS"; setupGroups(); setupPartyList(); newDraft(false);
 $("partyName").addEventListener("input",lookupParty);$("partyName").addEventListener("change",lookupParty);
 $("productGroup").addEventListener("change",changeGroup);$("catalogSheet").addEventListener("change",changeSheet);
 $("catalogSheetSearch").addEventListener("input",filterCatalogueSheets);
 $("prevBtn").onclick=()=>slideProduct(-1);$("nextBtn").onclick=()=>slideProduct(1);$("addBtn").onclick=addSelectedProduct;
 $("previewBtn").onclick=openPreview;$("confirmBtn").onclick=confirmEstimation;$("newOrderBtn").onclick=()=>newDraft(true);
 $("savePdfBtn").onclick=()=>downloadPDF(confirmedOrder||buildDraft());$("saveExcelBtn").onclick=()=>downloadExcel(confirmedOrder||buildDraft());
 $("forwardBtn").onclick=()=>$("forwardPanel").classList.toggle("hidden");$("sendWorkshopBtn").onclick=forwardToWorkshop;
 document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
 ["address","cellNo","touch","deliveryDate","note"].forEach(id=>{$(id).oninput=renderMeta;$(id).onchange=renderMeta});
}
function setupGroups(){ $("productGroup").innerHTML=Object.keys(catalogue).map(g=>`<option>${esc(g)}</option>`).join("");$("productGroup").value=group;populateSheets();$("groupPill").textContent=group; }
function populateSheets(){let ss=Object.keys(catalogue[group].sheets);if(!ss.includes(sheet))sheet=ss[0];$("catalogSheetSearch").value="";$("catalogSheet").innerHTML=ss.map(s=>`<option>${esc(s)}</option>`).join("");$("catalogSheet").value=sheet;}
function filterCatalogueSheets(){let q=$("catalogSheetSearch").value.trim().toLowerCase(),ss=Object.keys(catalogue[group].sheets),matches=ss.filter(s=>s.toLowerCase().includes(q)),sel=$("catalogSheet");sel.innerHTML=matches.map(s=>`<option>${esc(s)}</option>`).join("");if(matches.length){let keep=matches.includes(sheet)?sheet:matches[0];sel.value=keep;}else{sel.innerHTML='<option value="" disabled>No matching catalogue sheet</option>';sel.value="";}}
function setupPartyList(){ $("partyList").innerHTML=Object.keys(parties).sort().map(n=>`<option value="${esc(n)}"></option>`).join("");}
function lookupParty(){let p=parties[$("partyName").value.trim()];if(p){$("address").value=p.address||"";$("cellNo").value=p.cell||""}renderMeta();}
function estimationNo(){let n=Number(localStorage.getItem(KEYS.estimates)||0)+1;localStorage.setItem(KEYS.estimates,n);return"E-"+String(n).padStart(5,"0");}
function nextOrderNo(g){let k="gp_order_counter_"+g,n=Number(localStorage.getItem(k)||0);if(!n)n=catalogue[g].orderStart||1;if(g==="3D IDOLS"&&n<4002)n=4002;return n;}
function consumeOrderNo(g,n){localStorage.setItem("gp_order_counter_"+g,n+1);}
function deliveryDefault(){let d=new Date();d.setDate(d.getDate()+19);return d.toISOString().slice(0,10);}
function newDraft(ask){if(ask&&(order.length||confirmedOrder)&&!confirm("Start a new order? Current order will be cleared."))return;order=[];confirmedOrder=null;index=0;$("estimateNo").value=estimationNo();$("estimateDate").value=today();$("deliveryDate").value=deliveryDefault();$("partyName").value="";$("address").value="";$("cellNo").value="";$("note").value="";$("touch").value="92.5%";$("draftStatus").textContent="NEW DRAFT";$("confirmedBanner").textContent="Draft only. Click PREVIEW, check the window, then CONFIRM.";$("confirmedBanner").className="confirmed-banner";$("forwardPanel").classList.add("hidden");$("forwardBtn").disabled=true;$("finalOrderNo").textContent="—";$("orderNumberPreview").textContent="ORDER NO. —";populateSheets();showProduct();renderOrder();}
function changeGroup(){group=$("productGroup").value;sheet=Object.keys(catalogue[group].sheets)[0];index=0;order=[];$("groupPill").textContent=group;populateSheets();showProduct();renderOrder();}
function changeSheet(){sheet=$("catalogSheet").value;index=0;showProduct();}
function renderArtBox(){let ps=products();$("artNoBox").innerHTML=ps.map((p,i)=>`<button class="art-chip ${i===index?"active":""}" data-i="${i}">${esc(p.artNo)}</button>`).join("");document.querySelectorAll(".art-chip").forEach(b=>b.onclick=()=>selectProduct(+b.dataset.i));}
function showProduct(){let ps=products();if(!ps.length)return;if(index>=ps.length)index=0;let p=ps[index];$("catalogImage").src=p.image;$("catalogImage").classList.remove("hidden");$("imageFallback").classList.add("hidden");$("catalogImage").onerror=()=>{$("catalogImage").classList.add("hidden");$("imageFallback").classList.remove("hidden");$("missingImageName").textContent=p.image};$("detailArtNo").textContent=p.artNo;$("detailName").textContent=p.name;$("detailInch").textContent=p.heightInch?p.heightInch+" inch":"—";$("detailMm").textContent=p.sizeMm?p.sizeMm+" mm":"—";$("detailWeight").textContent=Number(p.weight).toFixed(2)+" g";$("detailGroup").textContent=group;$("detailImage").src=p.image;$("detailImage").alt=p.name+" ("+p.artNo+")";$("detailImage").classList.remove("hidden");$("detailImage").onerror=()=>{$("detailImage").classList.add("hidden")};$("slideCounter").textContent=`${index+1} / ${ps.length}`;$("quantity").value=1;renderArtBox();}
function selectProduct(i){index=i;showProduct()}function slideProduct(d){let ps=products();if(!ps.length)return;index=(index+d+ps.length)%ps.length;showProduct();}
function addSelectedProduct(){let p=products()[index];if(!p)return;let q=Math.max(1,parseInt($("quantity").value)||1),key=group+"|"+sheet+"|"+p.artNo,old=order.find(x=>x.key===key);if(old)old.qty+=q;else order.push({...p,qty:q,key,group,sheet});renderOrder();}
function totals(items=order){return{qty:items.reduce((s,p)=>s+p.qty,0),wt:items.reduce((s,p)=>s+p.qty*p.weight,0)}}
function renderOrder(){ $("orderBody").innerHTML=order.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.artNo)}</td><td>${esc(p.name)}</td><td>${esc(p.heightInch)}${p.heightInch?" inch":""} / ${esc(p.sizeMm)}${p.sizeMm?" mm":""}</td><td>${Number(p.weight).toFixed(2)}</td><td>${p.qty}</td><td>${(p.qty*p.weight).toFixed(2)}</td><td><img class="order-product-image" src="${esc(p.image)}" alt="${esc(p.name)} (${esc(p.artNo)})" onerror="this.classList.add(&apos;image-missing&apos;)"></td><td class="no-print"><button class="remove" data-r="${i}">REMOVE</button></td></tr>`).join("");document.querySelectorAll("[data-r]").forEach(b=>b.onclick=()=>{if(!confirmedOrder){order.splice(+b.dataset.r,1);renderOrder()}});let t=totals();$("totalQty").textContent=t.qty;$("totalWeight").textContent=t.wt.toFixed(2);renderMeta();}
function renderMeta(){$("notePreview").textContent=$("note").value||"—";$("metaGroup").textContent=group;$("metaOrderDate").textContent=dateFmt($("estimateDate").value);$("metaDelivery").textContent=dateFmt($("deliveryDate").value);}
function buildDraft(){return{estimateNo:$("estimateNo").value,partyName:$("partyName").value.trim(),address:$("address").value.trim(),cellNo:$("cellNo").value.trim(),group,touch:$("touch").value,orderDate:$("estimateDate").value,deliveryDate:$("deliveryDate").value,note:$("note").value.trim(),items:JSON.parse(JSON.stringify(order))};}
function previewHTML(o){let t=totals(o.items);return`<div class="preview-sheet"><div class="preview-heading"><div><span>GOLDPRINCE</span><small>JEWEL INDUSTRY INDIA PVT LTD</small></div><h2>ORDER PREVIEW</h2></div><div class="preview-info"><div><h3>PARTY DETAILS</h3><p><b>Party Name:</b> ${esc(o.partyName||"—")}</p><p><b>Address:</b> ${esc(o.address||"—")}</p><p><b>Cell No.:</b> ${esc(o.cellNo||"—")}</p></div><div><h3>ORDER DETAILS</h3><p><b>Estimation No.:</b> ${esc(o.estimateNo)}</p><p><b>Order Date:</b> ${dateFmt(o.orderDate)}</p><p><b>Product Group:</b> ${esc(o.group)}</p><p><b>Touch:</b> ${esc(o.touch)}</p><p><b>Approx Delivery Date:</b> ${dateFmt(o.deliveryDate)}</p></div></div><h3 class="preview-section-title">ORDER DETAILS</h3><div class="table-scroll"><table class="preview-table"><thead><tr><th>SL NO</th><th>ART NO</th><th>PRODUCT NAME</th><th>SIZE</th><th>WEIGHT (g)</th><th>ORDER QUANTITY</th><th>TOTAL WEIGHT (g)</th><th>IMAGE</th></tr></thead><tbody>${o.items.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.artNo)}</td><td>${esc(p.name)}</td><td>${esc(p.heightInch)} / ${esc(p.sizeMm)}</td><td>${Number(p.weight).toFixed(2)}</td><td>${p.qty}</td><td>${(p.qty*p.weight).toFixed(2)}</td><td><img class="order-product-image" src="${esc(p.image)}" alt="${esc(p.name)} (${esc(p.artNo)})" onerror="this.classList.add(&apos;image-missing&apos;)"></td></tr>`).join("")}</tbody><tfoot><tr><td colspan="5">TOTAL</td><td>${t.qty}</td><td>${t.wt.toFixed(2)}</td><td></td></tr></tfoot></table></div><div class="preview-note"><b>NOTE:</b> ${esc(o.note||"—")}</div></div>`;}
function openPreview(){if(!order.length){alert("Add at least one product.");return} $("previewContent").innerHTML=previewHTML(buildDraft());$("previewModal").classList.remove("hidden");}
function closeModal(id){$(id).classList.add("hidden")}
function confirmEstimation(){let d=buildDraft();if(!d.partyName){alert("Enter Party Name.");return}if(!d.items.length){alert("Add at least one product.");return}let no=nextOrderNo(d.group),o={...d,orderNo:no,status:"CONFIRMED",workshop:"",forwardedAt:"",dispatchDate:""};let a=getOrders();a.push(o);saveOrders(a);consumeOrderNo(d.group,no);confirmedOrder=o;order=o.items.map(x=>({...x}));closeModal("previewModal");$("orderNumberPreview").textContent="ORDER NO. "+no;$("finalOrderNo").textContent=no;$("draftStatus").textContent="CONFIRMED • "+no;$("confirmedBanner").textContent="Estimation confirmed. Order number generated: "+no;$("confirmedBanner").className="confirmed-banner success";$("forwardBtn").disabled=false;renderOrder();}
function forwardToWorkshop(){if(!confirmedOrder)return;let w=$("workshopSelect").value,a=getOrders(),i=a.findIndex(x=>x.orderNo===confirmedOrder.orderNo);if(i<0)return;a[i].workshop=w;a[i].status="SENT_TO_WORKSHOP";a[i].forwardedAt=new Date().toISOString();saveOrders(a);confirmedOrder=a[i];$("draftStatus").textContent="SENT TO "+w;$("confirmedBanner").textContent=`Order ${a[i].orderNo} forwarded to ${w}.`;$("forwardPanel").classList.add("hidden");alert(`Order ${a[i].orderNo} sent to ${w}.`);}
function downloadPDF(o){if(!o?.items?.length){alert("No order details available.");return}let{jsPDF}=window.jspdf,doc=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});doc.setFillColor(245,203,168);doc.rect(8,8,281,12,"F");doc.setFontSize(15);doc.setTextColor(93,43,126);doc.text("GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD",148,16,{align:"center"});doc.setTextColor(0,0,0);doc.setFontSize(9);doc.text("ORDER FORM",10,27);doc.text("ORDER NO: "+o.orderNo,235,27);doc.text("PRODUCT GROUP: "+o.group,10,33);doc.text("ORDER DATE: "+dateFmt(o.orderDate),100,33);doc.text("APPROX DELIVERY: "+dateFmt(o.deliveryDate),180,33);doc.text("TOUCH: "+o.touch,10,39);let rows=o.items.map((p,i)=>[i+1,p.artNo,p.name,(p.heightInch||"")+" / "+(p.sizeMm||""),Number(p.weight).toFixed(2),p.qty,(p.qty*p.weight).toFixed(2)]),t=totals(o.items);doc.autoTable({startY:44,head:[["SL NO","ART NO","PRODUCT NAME","SIZE","WEIGHT (g)","ORDER QUANTITY","TOTAL WEIGHT (g)"]],body:rows,foot:[["","","","","TOTAL",t.qty,t.wt.toFixed(2)]],styles:{fontSize:8,halign:"center"},headStyles:{fillColor:[245,245,245],textColor:[0,0,0]},footStyles:{fontStyle:"bold",textColor:[0,0,0]}});doc.text("NOTE: "+(o.note||"—"),10,doc.lastAutoTable.finalY+9);doc.save(`GoldPrince_Order_${o.orderNo}.pdf`);}
function downloadExcel(o){if(!o?.items?.length){alert("No order details available.");return}let wb=XLSX.utils.book_new(),t=totals(o.items),info=[["GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD"],["ORDER NO.",o.orderNo],["PRODUCT GROUP",o.group],["ORDER DATE",dateFmt(o.orderDate)],["APPROX DELIVERY DATE",dateFmt(o.deliveryDate)],["TOUCH",o.touch],["WORKSHOP",o.workshop||""],["NOTE",o.note||""]],rows=o.items.map((p,i)=>({"SL NO":i+1,"ART NO":p.artNo,"PRODUCT NAME":p.name,"SIZE":(p.heightInch||"")+" / "+(p.sizeMm||""),"WEIGHT (g)":p.weight,"ORDER QUANTITY":p.qty,"TOTAL WEIGHT (g)":+(p.qty*p.weight).toFixed(2)}));rows.push({"SL NO":"","ART NO":"","PRODUCT NAME":"","SIZE":"TOTAL","WEIGHT (g)":"","ORDER QUANTITY":t.qty,"TOTAL WEIGHT (g)":+t.wt.toFixed(2)});XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(info),"Order Info");XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Order Details");XLSX.writeFile(wb,`GoldPrince_Order_${o.orderNo}.xlsx`);}

function setupShop(){renderShop();$("refreshShopBtn").onclick=renderShop;document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>closeModal(b.dataset.close));$("shopPdfBtn").onclick=()=>downloadPDF(selectedShopOrder);$("shopExcelBtn").onclick=()=>downloadExcel(selectedShopOrder);$("readyHoBtn").onclick=forwardToHO;}
function renderShop(){let a=getOrders().filter(o=>o.status==="SENT_TO_WORKSHOP");$("shopCount").textContent=`${a.length} ORDER${a.length===1?"":"S"}`;$("shopBody").innerHTML=a.length?a.map((o,i)=>`<tr><td>${i+1}</td><td><button class="order-link" data-order="${esc(o.orderNo)}">${esc(o.orderNo)}</button></td><td>${esc(o.group)}</td><td>${dateFmt(o.orderDate)}</td><td>${o.dispatchDate?dateFmt(o.dispatchDate):"—"}</td><td>${esc(o.workshop)}</td></tr>`).join(""):`<tr><td colspan="6" class="empty">No active forwarded workshop orders.</td></tr>`;document.querySelectorAll("[data-order]").forEach(b=>b.onclick=()=>openShopOrder(b.dataset.order));}
function openShopOrder(no){let o=getOrders().find(x=>String(x.orderNo)===String(no)&&x.status==="SENT_TO_WORKSHOP");if(!o)return;selectedShopOrder=o;let t=totals(o.items);$("shopOrderContent").innerHTML=`<div class="shop-modal-head"><div><span>WORKSHOP ORDER</span><h2>ORDER ${esc(o.orderNo)}</h2></div><span class="workshop-badge">${esc(o.workshop)}</span></div><div class="preview-info"><div><h3>ORDER</h3><p><b>Order Number:</b> ${esc(o.orderNo)}</p><p><b>Product Group:</b> ${esc(o.group)}</p><p><b>Order Date:</b> ${dateFmt(o.orderDate)}</p></div><div><h3>DELIVERY</h3><p><b>Approx Delivery:</b> ${dateFmt(o.deliveryDate)}</p><p><b>Dispatch Date:</b> ${o.dispatchDate?dateFmt(o.dispatchDate):"Not dispatched"}</p><p><b>Touch:</b> ${esc(o.touch)}</p></div></div><div class="table-scroll"><table class="preview-table"><thead><tr><th>SL</th><th>ART NO</th><th>PRODUCT</th><th>SIZE</th><th>WT (g)</th><th>QTY</th><th>TOTAL WT</th></tr></thead><tbody>${o.items.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.artNo)}</td><td>${esc(p.name)}</td><td>${esc(p.heightInch)} / ${esc(p.sizeMm)}</td><td>${p.weight}</td><td>${p.qty}</td><td>${(p.qty*p.weight).toFixed(2)}</td></tr>`).join("")}</tbody><tfoot><tr><td colspan="5">TOTAL</td><td>${t.qty}</td><td>${t.wt.toFixed(2)}</td><td></td></tr></tfoot></table></div><div class="preview-note"><b>NOTE:</b> ${esc(o.note||"—")}</div>`;$("shopOrderModal").classList.remove("hidden");}
function forwardToHO(){if(!selectedShopOrder)return;let d=prompt("Enter dispatch date (YYYY-MM-DD):",today());if(!d)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){alert("Use YYYY-MM-DD.");return}let a=getOrders(),i=a.findIndex(o=>o.orderNo===selectedShopOrder.orderNo&&o.status==="SENT_TO_WORKSHOP");if(i<0)return;a[i].dispatchDate=d;a[i].status="FORWARDED_TO_HO";a[i].forwardedToHOAt=new Date().toISOString();saveOrders(a);closeModal("shopOrderModal");selectedShopOrder=null;renderShop();alert("Order forwarded to HO and removed from GPWORK-SHOP.");}

if(document.body.dataset.page==="order")setupOrder();
if(document.body.dataset.page==="shop")setupShop();
