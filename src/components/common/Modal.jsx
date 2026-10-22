import {handleDialogEscape} from '../../keyboard';
import React,{useRef,useEffect} from 'react';import {X} from 'lucide-react';
export default function Modal({title,children,close}){
 const ref=useRef(),closeRef=useRef(close);closeRef.current=close;
 useEffect(()=>{const previous=document.activeElement;const el=ref.current;const controls=()=>[...el.querySelectorAll('input:not([type="hidden"]),select,textarea,button,a[href],[tabindex="0"]')].filter(x=>!x.disabled&&x.getAttribute('aria-hidden')!=='true');
 (el.querySelector('input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled])')||controls()[0]||el).focus();
 function trap(e){if(e.defaultPrevented||e.isComposing||document.querySelector('.swal2-container'))return;
 if(handleDialogEscape(e,()=>closeRef.current()))return;
 if(e.key==='Tab'){const items=controls(),first=items[0],last=items.at(-1);if(!first){e.preventDefault();return;}if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
 }
 el.addEventListener('keydown',trap);return()=>{el.removeEventListener('keydown',trap);if(previous?.isConnected)previous.focus()};},[]);
 return <div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="modal" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><span className="eyebrow">GEN ZI CORNER</span><h2>{title}</h2></div><button type="button" className="icon" onClick={close} aria-label="Close dialog"><X/></button></div>{children}</section></div>;
}
