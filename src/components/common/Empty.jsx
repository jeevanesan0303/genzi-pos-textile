import React,{useRef,useEffect} from 'react';
import {ShoppingCart,X} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import {money} from '../../domain';
export default function Empty({text}){return <div className="empty"><ShoppingCart size={30}/><p>{text}</p></div>}
