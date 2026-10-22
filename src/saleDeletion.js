import {returnedQty} from './returns.js';
export function deleteLocalSale(data,id){
 const sale=data.sales.find(s=>s.id===id);if(!sale)throw Error('Receipt not found');if(sale.exchangeFrom||sale.returns?.some(r=>r.mode==='exchange'))throw Error('Linked exchange receipts must be retained for stock and payment history');if(sale.sync==='synced')throw Error('Cloud-synced receipts require the backend deletion endpoint');
 return {...data,products:data.products.map(p=>({...p,stock:p.stock+sale.items.filter(i=>i.id===p.id).reduce((n,i)=>n+i.qty-returnedQty(sale,i.id),0)})),sales:data.sales.filter(s=>s.id!==id)};
}
