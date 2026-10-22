import React,{useRef,useEffect} from 'react';
import {ShoppingCart,X} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import {money} from '../../domain';
export default function Label({product}){const ref=useRef();useEffect(()=>{try{JsBarcode(ref.current,product.sku,{format:'CODE128',width:1.5,height:40,displayValue:true,fontSize:12,margin:5})}catch{}},[product.sku]);return <div className="label-tag"><b>GEN ZI CORNER</b><span>{product.name}</span><small>{product.size} · {product.colour}</small><svg ref={ref}/><strong>{money(product.price)}</strong></div>}
