import{test}from'node:test';import assert from'node:assert/strict';import{totals,completeSale}from'../src/domain.js';
test('split-item totals and discount calculate correctly',()=>assert.deepEqual(totals([{price:4950,qty:2},{price:3250,qty:1}],500),{subtotal:13150,total:12650}));
test('sale atomically rejects insufficient stock',()=>{const p=[{id:'1',stock:2}];assert.throws(()=>completeSale(p,[{id:'1',name:'Dress',qty:3}]),/Insufficient/);assert.equal(p[0].stock,2)});
test('sale reduces stock without mutating source',()=>{const p=[{id:'1',stock:5}];assert.equal(completeSale(p,[{id:'1',qty:2,price:100,cost:50}])[0].stock,3);assert.equal(p[0].stock,5)});
test('empty sale is rejected',()=>assert.throws(()=>completeSale([],[]),/Add an item/));
test('fractional and non-finite quantities cannot corrupt stock',()=>{for(const qty of [NaN,Infinity,1.5,-1,0])assert.throws(()=>completeSale([{id:'1',stock:5}],[{id:'1',qty,price:100,cost:50}]))});
test('duplicate cart lines are rejected',()=>assert.throws(()=>completeSale([{id:'1',stock:5}],[{id:'1',qty:3,price:100,cost:50},{id:'1',qty:3,price:100,cost:50}]),/Duplicate/));
test('invalid price and cost are rejected',()=>{for(const price of [NaN,Infinity,-1])assert.throws(()=>completeSale([{id:'1',stock:5}],[{id:'1',qty:1,price,cost:50}]))});
test('money arithmetic rounds cents and clamps invalid discounts',()=>{assert.deepEqual(totals([{price:0.1,qty:3}],0.1),{subtotal:0.3,total:0.2});assert.equal(totals([{price:100,qty:1}],-10).total,100);assert.equal(totals([{price:100,qty:1}],Infinity).total,100)});
