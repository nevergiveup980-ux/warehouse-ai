import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const build138=fs.readFileSync(new URL('../build138-cloud-master-authority.js',import.meta.url),'utf8');
const build139=fs.readFileSync(new URL('../build139-settings-visibility-recovery.js',import.meta.url),'utf8');

// Regression: Build138 must never again scan ancestor DIVs by text, because the parent
// Settings card contains the retired helper sentence in descendant text.
assert.doesNotMatch(build138,/querySelectorAll\?\.\('div,span,p,small'\)/,'Build138 must not broadly text-scan Settings ancestors');
assert.match(build138,/querySelectorAll\?\.\('\.meta'\)/,'Build138 may only inspect leaf helper metadata');
assert.match(build138,/restoreSettingsVisibility/,'Build138 must explicitly recover Settings visibility');

function style(display=''){
  return {
    display,
    removeProperty(name){if(name==='display')this.display='';}
  };
}
const classList={contains:name=>name==='card',add(){},remove(){}};
const mainCard={style:style('none'),classList};
const settings={children:[mainCard],querySelectorAll:()=>[]};
const versionEl={textContent:''};
const document={
  readyState:'loading',visibilityState:'visible',
  documentElement:{attrs:{},setAttribute(k,v){this.attrs[k]=String(v)}},
  getElementById(id){if(id==='settings')return settings;if(id==='headerVersion')return versionEl;return null;},
  addEventListener(){}
};
const window={document,addEventListener(){}};
const context=vm.createContext({window,document,console,setTimeout,clearTimeout,setInterval,clearInterval,MutationObserver:undefined});
vm.runInContext(build139,context,{filename:'build139-settings-visibility-recovery.js'});

const api=window.RUNLUSettingsVisibilityBuild139;
assert.ok(api,'Build139 recovery API should be installed');
assert.equal(mainCard.style.display,'none','test starts with the Settings card hidden like the reported regression');
assert.equal(api.recoverSettings(),true,'recovery should find the primary Settings card');
assert.equal(mainCard.style.display,'','Build139 must restore the hidden Settings card');
api.showVersion();
assert.equal(versionEl.textContent,'V6.12.44');
assert.equal(document.documentElement.attrs['data-runlu-build'],'139');

console.log('PASS Build139 Settings visibility recovery: parent Settings card restored; broad ancestor text scan retired.');
