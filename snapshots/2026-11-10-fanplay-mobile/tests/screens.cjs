const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const el={innerHTML:'',style:{setProperty(){}},addEventListener(){},classList:{add(){},remove(){}}};
const ctx=vm.createContext({console,document:{querySelector:()=>el,querySelectorAll:()=>[],documentElement:el},localStorage:{getItem:()=>null,setItem(){}},location:{hash:'#home'},window:{addEventListener(){},scrollTo(){}},setTimeout:()=>1,clearTimeout(){},confirm:()=>false,prompt:()=>null});
for(const f of ['game-data','storage','game','tickets','app'])vm.runInContext(fs.readFileSync(__dirname+'/../js/'+f+'.js','utf8'),ctx);
for(const route of ['home','create','collection','game','community','profile']){ctx.location.hash='#'+route;vm.runInContext('render()',ctx);assert(el.innerHTML.length>300);console.log('PASS empty screen '+route);}
ctx.FP.data.tickets.push(ctx.FP.copy(ctx.FP.sample));ctx.FP.data.posts.push({id:'p',nickname:'팬',text:'시연',ticket:ctx.FP.copy(ctx.FP.sample),comments:[],liked:false});ctx.FP.data.profile.featuredTicketId='sample';
ctx.FP.startCareer('선수','투수');ctx.FP.choose(1);
for(const route of ['home','collection','game','community','profile']){ctx.location.hash='#'+route;vm.runInContext('render()',ctx);console.log('PASS populated screen '+route);}
for(let i=1;i<8;i++)ctx.FP.choose(2);ctx.location.hash='#game';vm.runInContext('render()',ctx);assert(el.innerHTML.includes('CAREER COMPLETE'));console.log('PASS completion screen');
console.log('TOTAL 12 SCREEN RENDERS PASS (DOM stub, not browser)');
