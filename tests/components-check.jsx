import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {seed,money,totals} from '../src/domain';
import PosView from '../src/components/pos/PosView';
import ProductsView from '../src/components/products/ProductsView';
import ReportsView from '../src/components/reports/ReportsView';
import SettingsView from '../src/components/settings/SettingsView';
import LabelsView from '../src/components/labels/LabelsView';
import CategoriesView from '../src/components/categories/CategoriesView';
import DashboardView from '../src/components/dashboard/DashboardView';
import ReceiptModal from '../src/components/pos/ReceiptModal';
import PaymentModal from '../src/components/pos/PaymentModal';
import CustomersView from '../src/components/customers/CustomersView';
import EmployeesView from '../src/components/employees/EmployeesView';
const noop=()=>{},data=structuredClone(seed),title=(t)=><h1>{t}</h1>,props={data,title,query:'',table:()=>null,actions:()=>null,money,category:'All',setCategory:noop,cart:[],setCart:noop,add:noop,customer:'',setCustomer:noop,discount:0,setDiscount:noop,total:totals([]),setTender:noop,setModal:noop,hold:noop,toast:noop,Empty:()=>null,change:noop,theme:'light',setTheme:noop,backup:noop,setData:noop,revenue:0,profit:0,liveSales:[],setPage:noop,exportSales:noop,close:noop,finish:noop,payment:'Cash',setPayment:noop,cardAmount:0,setCardAmount:noop,tender:'',modal:{sale:{number:'TEST',date:new Date().toISOString(),items:[{name:'Test',qty:1,price:100}],total:100,payment:'Cash',customer:'Walk-in'}}};
for(const C of [CustomersView,EmployeesView,PosView,ProductsView,ReportsView,SettingsView,LabelsView,CategoriesView,DashboardView,ReceiptModal,PaymentModal]){const html=renderToStaticMarkup(<C {...props}/>);if(!html)throw Error('No output '+C.name);console.log('PASS',C.name,html.length)}

const customers=renderToStaticMarkup(<CustomersView {...props} title={t=><h1>{t}</h1>}/>);if(customers.includes('Staff & Permissions'))throw Error('Customer page incorrectly renders staff');
