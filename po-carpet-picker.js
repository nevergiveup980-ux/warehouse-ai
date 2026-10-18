/* Warehouse OS V8 · PO carpet picker (pilot). No storage writes. */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
function open(){
 const panel=$('poCarpetPickerPanel'),select=$('poCarpetPickerSelect'),notice=$('poCarpetPickerNotice');
 if(!panel||!select)return false;
 let rolls=[];
 try{rolls=typeof root.carpetRecords==='function'?root.carpetRecords():[]}catch(e){if(notice)notice.textContent='Carpet data unavailable. No changes made.';return false}
 select.replaceChildren(new Option('Choose a carpet roll…',''));
 for(const roll of rolls){
  if(!roll||roll.id==null||!roll.roll||['Split to RAM','Split to REM','Used Up'].includes(roll.status))continue;
  const label=[roll.roll,roll.collection,roll.colour,roll.location].filter(Boolean).join(' · ');
  select.add(new Option(label,String(roll.id)));
 }
 panel.hidden=false;
 if(notice)notice.textContent='Select a roll and confirm. Unsaved PO fields stay on this page.';
 select.focus();return true;
}
function apply(){
 const select=$('poCarpetPickerSelect'),notice=$('poCarpetPickerNotice');
 const id=select?.value;if(!id)return false;
 const rolls=typeof root.carpetRecords==='function'?root.carpetRecords():[];
 const roll=rolls.find(x=>String(x.id)===id);
 if(!roll){if(notice)notice.textContent='Roll no longer available. Refresh selection.';return false}
 const product=$('orderProduct'),location=$('orderLocation'),unit=$('orderUnit');
 if(!product||!location||!unit)return false;
 product.value=[roll.collection,roll.colour,'Roll '+roll.roll].filter(Boolean).join(' · ');
 if(roll.location)location.value=roll.location;
 unit.value='Roll';
 $('poCarpetPickerPanel').hidden=true;
 product.focus();return true;
}
function close(){const p=$('poCarpetPickerPanel');if(p)p.hidden=true}
root.RUNLUWarehousePOPicker=Object.freeze({open,apply,close});
})(window);
