// Shared Enter handling: never submit twice, interrupt IME, or override buttons/selects.
export function handleFormEnter(event){
 if(event.repeat&&event.key==='Enter'&&!event.isComposing&&!['TEXTAREA','SELECT'].includes(event.target?.tagName)){event.preventDefault();return true;}
 if(event.defaultPrevented||event.isComposing||event.keyCode===229||event.key!=='Enter'||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return false;
 const target=event.target;if(!target||target.closest?.('.swal2-container')||target.ownerDocument?.querySelector('.swal2-container'))return false;
 if(target.tagName!=='INPUT'||['button','submit','reset','file','checkbox','radio','range','color','date','time','datetime-local','month','week'].includes(target.type)||target.isContentEditable)return false;
 const form=target.form;if(!form||typeof form.requestSubmit!=='function')return false;
 const buttons=[...form.querySelectorAll('button,input')].filter(el=>el.type==='submit');
 const submitter=buttons.find(el=>!el.disabled);
 if((buttons.length&&!submitter)||form.getAttribute('aria-busy')==='true'){event.preventDefault();return true;}
 event.preventDefault();form.requestSubmit(submitter);return true;
}
export function ignoreShortcut(event){return event.defaultPrevented||event.isComposing||event.keyCode===229||event.repeat||event.target?.ownerDocument?.querySelector('.swal2-container');}
export function handleDialogEscape(event,close,blocked=false){
 if(event.key!=='Escape'||event.defaultPrevented||event.isComposing||blocked)return false;
 event.preventDefault();event.stopPropagation();if(!event.repeat)close();return true;
}
