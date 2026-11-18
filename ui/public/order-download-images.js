/* GoldPrince image-enabled PDF/XLSX downloads. */
(function () {
  function imageToDataURL(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (!w || !h) return resolve(null);
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/png'));
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = String(src);
    });
  }

  async function getItemImages(items) {
    var out = [];
    for (var i = 0; i < (items || []).length; i++) {
      out.push(await imageToDataURL(items[i].image));
    }
    return out;
  }

  function missingMessage(images) {
    var n = images.filter(function (x) { return !x; }).length;
    if (n) console.warn('GoldPrince: ' + n + ' product image(s) could not be loaded. Make sure the images folder is beside the HTML files.');
  }

  window.downloadPDF = async function (o) {
    if (!o || !o.items || !o.items.length) { alert('No order details available.'); return; }
    if (!window.jspdf || !window.jspdf.jsPDF) { alert('PDF library is not loaded.'); return; }
    var images = await getItemImages(o.items);
    missingMessage(images);
    var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFillColor(245,203,168); doc.rect(8,8,281,12,'F');
    doc.setFontSize(15); doc.setTextColor(93,43,126); doc.text('GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD',148,16,{align:'center'});
    doc.setTextColor(0,0,0); doc.setFontSize(9);
    doc.text('ORDER FORM',10,27); doc.text('ORDER NO: '+(o.orderNo||''),235,27);
    doc.text('PRODUCT GROUP: '+(o.group||''),10,33); doc.text('ORDER DATE: '+dateFmt(o.orderDate),100,33);
    doc.text('APPROX DELIVERY: '+dateFmt(o.deliveryDate),180,33); doc.text('TOUCH: '+(o.touch||''),10,39);
    var t = totals(o.items);
    var rows = o.items.map(function(p,i){
      return [i+1,p.artNo||'',p.name||'',(p.heightInch||'')+' / '+(p.sizeMm||''),Number(p.weight||0).toFixed(2),p.qty||0,(Number(p.qty||0)*Number(p.weight||0)).toFixed(2),''];
    });
    doc.autoTable({
      startY:44,
      head:[['SL NO','ART NO','PRODUCT NAME','SIZE','WEIGHT (g)','ORDER QUANTITY','TOTAL WEIGHT (g)','IMAGE']],
      body:rows,
      foot:[['','','','','TOTAL',t.qty,t.wt.toFixed(2),'']],
      theme:'grid',
      styles:{fontSize:7,halign:'center',valign:'middle',minCellHeight:25},
      headStyles:{fillColor:[245,245,245],textColor:[0,0,0]},
      footStyles:{fontStyle:'bold',textColor:[0,0,0]},
      columnStyles:{7:{cellWidth:28}},
      didDrawCell:function(data){
        if(data.section==='body' && data.column.index===7){
          var src=images[data.row.index];
          if(src){
            try { doc.addImage(src,'PNG',data.cell.x+3,data.cell.y+2,22,21,undefined,'FAST'); } catch(e) { console.warn(e); }
          }
        }
      }
    });
    doc.text('NOTE: '+(o.note||'—'),10,doc.lastAutoTable.finalY+9);
    doc.save('GoldPrince_Order_'+o.orderNo+'.pdf');
  };

  window.downloadExcel = async function (o) {
    if (!o || !o.items || !o.items.length) { alert('No order details available.'); return; }
    if (!window.ExcelJS) { alert('Excel image library is not loaded. Please refresh the page.'); return; }
    var images = await getItemImages(o.items);
    missingMessage(images);
    var wb = new ExcelJS.Workbook();
    var ws = wb.addWorksheet('Order Form');
    ws.addRow(['GOLDPRINCE JEWEL INDUSTRY INDIA PVT LTD']);
    ws.addRow(['ORDER NO.',o.orderNo||'']);
    ws.addRow(['PRODUCT GROUP',o.group||'']);
    ws.addRow(['ORDER DATE',dateFmt(o.orderDate)]);
    ws.addRow(['APPROX DELIVERY DATE',dateFmt(o.deliveryDate)]);
    ws.addRow(['TOUCH',o.touch||'']);
    ws.addRow(['WORKSHOP',o.workshop||'']);
    ws.addRow(['NOTE',o.note||'']);
    ws.addRow([]);
    var header=ws.addRow(['SL NO','ART NO','PRODUCT NAME','SIZE','WEIGHT (g)','ORDER QUANTITY','TOTAL WEIGHT (g)','IMAGE']);
    header.font={bold:true};
    header.alignment={vertical:'middle',horizontal:'center'};
    o.items.forEach(function(p,i){
      var r=ws.addRow([i+1,p.artNo||'',p.name||'',(p.heightInch||'')+' / '+(p.sizeMm||''),Number(p.weight||0),Number(p.qty||0),+(Number(p.qty||0)*Number(p.weight||0)).toFixed(2),'']);
      r.height=90;
      r.alignment={vertical:'middle'};
      if(images[i]){
        try{
          var id=wb.addImage({base64:images[i],extension:'png'});
          ws.addImage(id,{tl:{col:7,row:r.number-1},ext:{width:90,height:84}});
        }catch(e){console.warn(e);}
      }
    });
    var t=totals(o.items);
    var tr=ws.addRow(['','','','','TOTAL',t.qty,+t.wt.toFixed(2),'']); tr.font={bold:true};
    ws.columns=[{width:8},{width:14},{width:30},{width:18},{width:14},{width:17},{width:18},{width:16}];
    ws.getRow(1).font={bold:true,size:14};
    ws.views=[{state:'frozen',ySplit:10}];
    var buf=await wb.xlsx.writeBuffer();
    var blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='GoldPrince_Order_'+o.orderNo+'.xlsx'; a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);},3000);
  };
})();
