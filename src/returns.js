export const returnedQty=(sale,id)=>sale.returns?sale.returns.reduce((n,r)=>n+r.items.filter(i=>i.id===id).reduce((a,i)=>a+i.qty,0),0):sale.returned?(sale.items.find(i=>i.id===id)?.qty||0):0;
export const refundTotal=s=>s.returns?s.returns.reduce((n,r)=>n+r.total,0):s.returned?s.total:0;
export function applyReturn(data,saleId,quantities,reason,now=Date.now()){
const s=data.sales.find(x=>x.id===saleId);if(!s)throw Error('Receipt not found');if(s.sync==='synced')throw Error('Synced exchanges require the backend exchange endpoint');
const age=now-new Date(s.date).getTime();if(!Number.isFinite(age)||age<0||age>5*86400000)throw Error('Exchange period expired: exchanges are accepted within 5 days');
if(!reason.trim())throw Error('Enter a reason');
const subtotal=s.items.reduce((n,i)=>n+i.price*i.qty,0);const ratio=subtotal?s.total/subtotal:0;
const items=s.items.flatMap(i=>{const qty=Number(quantities[i.id]||0);if(!Number.isInteger(qty)||qty<0||qty>i.qty-returnedQty(s,i.id))throw Error('Invalid exchange quantity for '+i.name);if(qty&&!data.products.some(p=>p.id===i.id))throw Error('Restore the deleted product before exchanging '+i.name);return qty?[{id:i.id,name:i.name,qty,amount:Math.round(i.price*qty*ratio*100)/100}]:[]});
if(!items.length)throw Error('Select at least one product');const remaining=s.total-refundTotal(s);const full=s.items.every(i=>returnedQty(s,i.id)+(items.find(x=>x.id===i.id)?.qty||0)===i.qty);const total=full?Math.round(remaining*100)/100:Math.min(remaining,Math.round(items.reduce((n,i)=>n+i.amount,0)*100)/100);
const record={id:crypto.randomUUID(),date:new Date(now).toISOString(),items,total,reason:reason.trim()};
return {...data,products:data.products.map(p=>({...p,stock:p.stock+(items.find(i=>i.id===p.id)?.qty||0)})),sales:data.sales.map(x=>x.id===s.id?{...x,returned:full,returns:[...(x.returns||[]),record]}:x)};
}
