import {applyReturn} from './returns.js';
const round=n=>Math.round(n*100)/100;
export function processReturn(data,saleId,quantities,reason,{mode='exchange',replacements=[],condition='Resellable',payment='Cash'}={},now=Date.now()){
 if(mode!=='exchange')throw Error('Only product exchanges are allowed. No refunds.');
 if(!['Resellable','Damaged'].includes(condition))throw Error('Choose item condition');
 if(!['Cash','Card','Bank Transfer'].includes(payment))throw Error('Choose a payment method');
 let next=applyReturn(data,saleId,quantities,reason,now);
 let original=next.sales.find(s=>s.id===saleId);const record=original.returns.at(-1);
 const number='RT-'+record.id.slice(0,8).toUpperCase();
 if(condition==='Damaged')next={...next,products:next.products.map(p=>({...p,stock:p.stock-(record.items.find(i=>i.id===p.id)?.qty||0)}))};
 let newSale=null;
 if(mode==='exchange'){
 if(!replacements.length)throw Error('Select at least one replacement dress');
 const seen=new Set();const items=replacements.map(line=>{const p=next.products.find(p=>p.id===line.id);const qty=Number(line.qty);if(!p||seen.has(line.id)||!Number.isInteger(qty)||qty<1||qty>p.stock)throw Error('Invalid replacement quantity or insufficient stock');if(!Number.isFinite(Number(p.price))||Number(p.price)<0)throw Error('Invalid replacement price');seen.add(p.id);return {...p,qty}});
 const total=round(items.reduce((n,i)=>n+Number(i.price)*i.qty,0));const difference=round(total-record.total);
 if(difference<0)throw Error('Replacement items must equal or exceed the exchange value. No refunds.');
 newSale={id:crypto.randomUUID(),number:'EX-'+record.id.slice(0,8).toUpperCase(),date:new Date(now).toISOString(),customer:original.customer,items,total,discount:0,payment,cash:payment==='Cash'?Math.max(0,difference):0,card:payment==='Card'?Math.max(0,difference):0,cashReceived:payment==='Cash'?Math.max(0,difference):undefined,changeDue:0,sync:'pending',exchangeCredit:Math.min(total,record.total),exchangeFrom:original.number,exchangeReturnId:record.id,additionalPayment:Math.max(0,difference),refundPaid:0};
 next={...next,products:next.products.map(p=>({...p,stock:p.stock-(items.find(i=>i.id===p.id)?.qty||0)})),sales:[...next.sales,newSale]};
 }
 const detail={...record,number,mode,condition,payment,replacementSaleId:newSale?.id,replacementNumber:newSale?.number,newItems:newSale?.items||[],newTotal:newSale?.total||0,creditUsed:newSale?.exchangeCredit||0,additionalPayment:newSale?.additionalPayment||0,cashRefund:0};
 next={...next,sales:next.sales.map(s=>s.id===saleId?{...s,returns:s.returns.map(v=>v.id===record.id?detail:v)}:s)};
 return {data:next,record:detail,originalNumber:original.number};
}
export function returnStatus(s){const exchanged=s.returns?.some(r=>r.mode==='exchange');return exchanged?(s.returned?'Exchanged':'Partially exchanged'):s.returned?'Returned':s.returns?.length?'Part returned':s.sync;}
