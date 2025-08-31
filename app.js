/*******************
 * Utility helpers *
 *******************/
const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const fmt = (n) => new Intl.NumberFormat(undefined, {maximumFractionDigits:2}).format(n);
const todayStr = () => new Date().toISOString().slice(0,10);

const store = {
  get(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }catch(e){ return fallback; } },
  set(key, value){ localStorage.setItem(key, JSON.stringify(value)); },
};

/*******************
 * Global state     *
 *******************/
const state = {
  currency: store.get('currency', '₹'),
  budget: store.get('budget', 25000),
  weekStart: store.get('weekStart', 1),
  theme: store.get('theme', 'dark'),
  categories: ['Food','Transport','Bills','Shopping','Health','Entertainment','Travel','Groceries','Education','Other'],
  expenses: store.get('expenses', []),
  keywordMap: store.get('keywordMap', {
    zomato:'Food', swiggy:'Food', dosa:'Food', biryani:'Food', pizza:'Food',
    ola:'Transport', uber:'Transport', fuel:'Transport', petrol:'Transport',
    electricity:'Bills', airtel:'Bills', jio:'Bills', rent:'Bills',
    amazon:'Shopping', flipkart:'Shopping', myntra:'Shopping',
    gym:'Health', doctor:'Health', medicine:'Health', pharmacy:'Health',
    netflix:'Entertainment', spotify:'Entertainment', movie:'Entertainment',
    flight:'Travel', train:'Travel', bus:'Travel', hotel:'Travel',
    bigbasket:'Groceries', dmart:'Groceries', vegetable:'Groceries', milk:'Groceries',
    course:'Education', udemy:'Education', coursera:'Education'
  })
};

document.documentElement.dataset.theme = state.theme === 'light' ? 'light' : 'dark';

/*******************
 * Navigation       *
 *******************/
$$('.nav button').forEach(btn=>{
  btn.addEventListener('click',()=>{
    $$('.nav button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.target;
    $$('.modules').forEach(m=>m.classList.remove('active'));
    $('#'+target).classList.add('active');
  });
});

$('#themeToggle').addEventListener('click', ()=>{
  const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = t; store.set('theme', t);
});

/*******************
 * Expenses logic   *
 *******************/
const catSelect = $('#category');
function renderCategorySelect(){
  catSelect.innerHTML = state.categories.map(c=>`<option>${c}</option>`).join('');
}
renderCategorySelect();

function predictCategory(text){
  if(!text) return 'Other';
  const t = text.toLowerCase();
  for(const [k,cat] of Object.entries(state.keywordMap)){
    if(t.includes(k)) return cat;
  }
  if(/\b(doctor|clinic|pharmacy|tablet|capsule)\b/.test(t)) return 'Health';
  if(/\b(recharge|bill|electric|wifi|rent)\b/.test(t)) return 'Bills';
  if(/\b(bus|train|metro|fuel|petrol|diesel)\b/.test(t)) return 'Transport';
  if(/\b(movie|cinema|theatre|netflix|spotify)\b/.test(t)) return 'Entertainment';
  if(/\b(amazon|flipkart|myntra|store|mall)\b/.test(t)) return 'Shopping';
  if(/\b(grocery|milk|vegetable|fruit|dmart|bigbasket)\b/.test(t)) return 'Groceries';
  if(/\b(hotel|flight|air|train|tour|uber|ola)\b/.test(t)) return 'Travel';
  if(/\b(course|class|tuition|exam|books)\b/.test(t)) return 'Education';
  if(/\b(food|cafe|restaurant|order|zomato|swiggy|pizza|burger)\b/.test(t)) return 'Food';
  return 'Other';
}

function addExpense({amount, desc, date, category}){
  const id = crypto.randomUUID();
  const item = {id, amount:Number(amount), desc, date, category};
  state.expenses.unshift(item);
  store.set('expenses', state.expenses);
  refreshUI();
}

function deleteExpense(id){
  state.expenses = state.expenses.filter(e=>e.id!==id);
  store.set('expenses', state.expenses); refreshUI();
}

function updateExpenseCategory(id, newCat, originalText){
  const e = state.expenses.find(x=>x.id===id); if(!e) return;
  e.category = newCat; store.set('expenses', state.expenses);
  if(originalText){
    const tokens = originalText.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const prefer = tokens.find(t=>t.length>=4 && !['order','paid','bill','store','shop','from','city'].includes(t));
    if(prefer){ state.keywordMap[prefer] = newCat; store.set('keywordMap', state.keywordMap); }
  }
  refreshUI();
}

function currency(n){return `${state.currency}${fmt(n)}`}

function refreshUI(){
  const now = new Date();
  const m = now.getMonth(); const y = now.getFullYear();
  const inMonth = state.expenses.filter(e=>{ const d=new Date(e.date); return d.getMonth()===m && d.getFullYear()===y; });
  const spend = inMonth.reduce((s,e)=>s+e.amount,0);
  const daysSoFar = now.getDate();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const dailyAvg = spend / Math.max(1, daysSoFar);
  const forecast = dailyAvg * daysInMonth;
  const savings = Math.max(0, state.budget - forecast);

  $('#kpiSpend').textContent = currency(spend);
  $('#kpiTransactions').textContent = `${inMonth.length} transactions`;
  $('#kpiSavings').textContent = currency(savings);
  $('#kpiForecast').textContent = currency(forecast);
  $('#kpiBudget').textContent = `Budget: ${currency(state.budget)}`;
  $('#monthName').textContent = now.toLocaleString(undefined,{month:'long', year:'numeric'});

  const alerts = $('#alerts'); alerts.innerHTML = '';
  const alertDiv = document.createElement('div');
  if(forecast > state.budget){ alertDiv.className='alert danger'; alertDiv.textContent = `Over budget by ${currency(forecast - state.budget)} (forecast). Consider reducing discretionary spend.`; }
  else if(state.budget - forecast < state.budget*0.1){ alertDiv.className='alert warn'; alertDiv.textContent = `Close to budget limit. Cushion: ${currency(state.budget-forecast)}.`; }
  else { alertDiv.className='alert ok'; alertDiv.textContent = 'You are on track. Keep it up!'; }
  alerts.append(alertDiv);

  renderTables();
  renderCharts(inMonth);

  $('#currency').value = state.currency;
  $('#budget').value = state.budget;
}

function renderTables(){
  const tbody = $('#expenseTable tbody');
  const tbody2 = $('#expenseTableFull tbody');
  tbody.innerHTML = ''; tbody2.innerHTML = '';

  const recent = state.expenses.slice(0, 8);
  const rows = (arr) => arr.map(e=>{
    const tr = document.createElement('tr');
    const date = new Date(e.date).toLocaleDateString();
    tr.innerHTML = `<td>${date}</td><td>${e.desc}</td>
      <td><select class="input" data-id="${e.id}">${state.categories.map(c=>`<option ${c===e.category?'selected':''}>${c}</option>`).join('')}</select></td>
      <td style="font-weight:700">${currency(e.amount)}</td>
      <td><button class="btn secondary" data-del="${e.id}">Delete</button></td>`;
    return tr;
  });

  rows(recent).forEach(r=>tbody.append(r));
  rows(state.expenses).forEach(r=>tbody2.append(r));

  $$('#expenseTable select, #expenseTableFull select').forEach(sel=>{
    sel.addEventListener('change', (ev)=>{
      const id = sel.dataset.id; const newCat = sel.value;
      const original = state.expenses.find(x=>x.id===id)?.desc || '';
      updateExpenseCategory(id,newCat,original);
    });
  });
  $$('#expenseTable [data-del], #expenseTableFull [data-del]').forEach(btn=>{
    btn.addEventListener('click', ()=> deleteExpense(btn.dataset.del));
  });

  $('#totalCount').textContent = `${state.expenses.length} items`;
}

/*******************
 * Charts           *
 *******************/
let trendChart, pieChart;
function renderCharts(inMonth){
  const d = new Date(); const m = d.getMonth(); const y = d.getFullYear();
  const daysTotal = new Date(y, m+1, 0).getDate();
  const labels = Array.from({length: daysTotal}, (_,i)=> i+1);
  const byDay = new Array(daysTotal).fill(0);
  inMonth.forEach(e=>{ const day = new Date(e.date).getDate(); byDay[day-1]+= e.amount; });

  const ctx1 = $('#trendChart').getContext('2d');
  const ctx2 = $('#pieChart').getContext('2d');
  if(trendChart) trendChart.destroy();
  if(pieChart) pieChart.destroy();

  trendChart = new Chart(ctx1, {
    type:'line', data:{ labels, datasets:[{ label:'Daily Spend', data:byDay, tension:.35, borderWidth:3, pointRadius:0 }]},
    options:{ plugins:{legend:{display:false}}, scales:{ x:{ ticks:{ color: getComputedStyle(document.documentElement).getPropertyValue('--muted')} }, y:{ ticks:{ color: getComputedStyle(document.documentElement).getPropertyValue('--muted')}, grid:{ color: getComputedStyle(document.documentElement).getPropertyValue('--border')}}}, maintainAspectRatio:false }
  );

  const totals = state.categories.reduce((acc,c)=> (acc[c]=0, acc), {});
  inMonth.forEach(e=>{ totals[e.category] = (totals[e.category]||0) + e.amount; });
  const catLabels = Object.keys(totals).filter(k=>totals[k]>0);
  const catValues = catLabels.map(k=>totals[k]);

  pieChart = new Chart(ctx2, {
    type:'doughnut', data:{ labels:catLabels, datasets:[{ data:catValues, borderWidth:0 }]}, options:{ plugins:{legend:{labels:{ color: getComputedStyle(document.documentElement).getPropertyValue('--muted')}}}, maintainAspectRatio:false }
  );
}

/*******************
 * Forms & actions  *
 *******************/
$('#expenseForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const amount = $('#amount').value; const desc = $('#desc').value; const date = $('#date').value || todayStr(); const category = $('#category').value || predictCategory(desc);
  addExpense({amount, desc, date, category});
  e.target.reset(); $('#date').value = todayStr(); $('#ocrStatus').textContent='Saved!';
});

$('#btnCategorise').addEventListener('click', ()=>{
  const text = $('#desc').value; const predicted = predictCategory(text);
  $('#category').value = predicted; $('#ocrStatus').textContent = `Predicted: ${predicted}`;
});

$('#receipt').addEventListener('change', async (ev)=>{
  const file = ev.target.files[0]; if(!file) return;
  $('#ocrStatus').textContent = 'Reading receipt…';
  try{
    if(window.Tesseract){
      const { data } = await Tesseract.recognize(file, 'eng', { logger: m => $('#ocrStatus').textContent = `OCR: ${Math.round((m.progress||0)*100)}%` });
      const text = data.text || '';
      const amtMatch = text.match(/(?:rs|inr|total|amount)[^\d]{0,10}(\d+[.,]\d{2}|\d+)/i) || text.match(/(\d+[.,]\d{2})/);
      if(amtMatch){ $('#amount').value = amtMatch[1].replace(/,/g,''); }
      $('#desc').value = text.split(/\n/).slice(0,3).join(' ').slice(0,60) || 'Receipt';
      const predicted = predictCategory($('#desc').value);
      $('#category').value = predicted; $('#ocrStatus').textContent = `Predicted: ${predicted}`;
    } else {
      $('#ocrStatus').textContent = 'OCR unavailable';
    }
  }catch(err){ console.error(err); $('#ocrStatus').textContent='OCR failed'; }
});

$('#quickAdd').addEventListener('click', ()=>{
  const desc = prompt('Description (e.g. "Cafe Coffee Day")'); if(!desc) return;
  const amount = Number(prompt('Amount?')); if(!amount) return;
  const category = predictCategory(desc);
  addExpense({amount, desc, date: todayStr(), category});
});

$('#currency').addEventListener('input', ()=>{ state.currency = $('#currency').value || '₹'; store.set('currency', state.currency); refreshUI(); })
$('#budget').addEventListener('input', ()=>{ state.budget = Number($('#budget').value||0); store.set('budget', state.budget); refreshUI(); })

$('#seedDemo').addEventListener('click', ()=>{
  const d = todayStr();
  const seed = [
    {amount:249, desc:'Zomato biryani', date:d, category:'Food'},
    {amount:1200, desc:'Airtel broadband bill', date:d, category:'Bills'},
    {amount:90, desc:'Metro card recharge', date:d, category:'Transport'},
    {amount:999, desc:'Amazon T-shirt', date:d, category:'Shopping'},
    {amount:300, desc:'Pharmacy tablets', date:d, category:'Health'},
    {amount:499, desc:'Spotify Premium', date:d, category:'Entertainment'},
    {amount:2200, desc:'Monthly rent share', date:d, category:'Bills'},
    {amount:640, desc:'DMart groceries', date:d, category:'Groceries'}
  ];
  state.expenses = seed.concat(state.expenses);
  store.set('expenses', state.expenses); refreshUI();
});

/*******************
 * Search
 *******************/
$('#search').addEventListener('input', ()=>{
  const q = $('#search').value.toLowerCase();
  $$('#expenseTable tbody tr').forEach(tr=>{
    const t = tr.textContent.toLowerCase(); tr.style.display = t.includes(q) ? '' : 'none';
  });
});

/*******************
 * Interview Q Gen
 *******************/
const bank = {
  generic:[
    'Tell me about a recent project: goals, your role, and outcomes.',
    'Walk me through how you debug a tricky issue from scratch.',
    'Describe a time you disagreed with a teammate. What did you do?',
    'Explain an algorithm or concept as if I\u2019m new to it.',
    'How do you prioritize tasks when everything feels urgent?',
    'What metrics would you track to know you\u2019re succeeding?'
  ],
  data:[
    'Design a SQL schema for an e-commerce store and write a query for monthly revenue.',
    'Explain the bias-variance tradeoff with a practical example.',
    'How would you check if an A/B test uplift is statistically significant?',
    'What is data normalisation and when is denormalisation preferred?',
    'Given a dataset with missing values, outline a cleaning strategy.',
    'How would you detect anomalies in daily transaction data?'
  ],
  frontend:[
    'Explain event delegation in JavaScript with an example.',
    'How do you optimise a large React list for performance?',
    'What are critical rendering path and how to reduce time to interactive?',
    'Explain CSS specificity and how you\u2019d avoid conflicts at scale.',
    'What is debouncing vs throttling? When to use each?',
    'How do you secure a frontend app against XSS and CSRF?'
  ],
  ml:[
    'Compare logistic regression vs. SVM for a binary problem.',
    'How do you diagnose overfitting? List prevention techniques.',
    'When does a decision tree outperform linear models and why?',
    'Explain precision-recall vs ROC AUC and when each matters.',
    'Outline steps to productionise an ML model end-to-end.',
    'How to choose evaluation metrics for imbalanced classes?'
  ]
}

function generateQuestions(){
  const role = $('#role').value.toLowerCase();
  const skills = $('#skills').value.toLowerCase();
  const diff = $('#difficulty').value; const count = Math.max(3, Math.min(20, Number($('#count').value||8)));
  const pool = [...bank.generic];
  if(/data|analyst|sql|analytics/.test(role+skills)) pool.push(...bank.data);
  if(/front|react|css|html|js/.test(role+skills)) pool.push(...bank.frontend);
  if(/ml|ai|model|neural|sklearn/.test(role+skills)) pool.push(...bank.ml);

  const harden = (q)=> diff==='Hard' ? `Deep dive: ${q}` : diff==='Medium' ? `Explain clearly: ${q}` : q;
  const shuffled = pool.sort(()=>Math.random()-0.5).slice(0,count).map(harden);
  const list = $('#questions'); list.innerHTML='';
  shuffled.forEach(q=>{ const li=document.createElement('li'); li.textContent=q; list.append(li); });
}
$('#genQs').addEventListener('click', generateQuestions);
$('#copyQs').addEventListener('click', ()=>{
  const text = $$('#questions li').map(li=>li.textContent).join('\n'); navigator.clipboard.writeText(text);
});

/*******************
 * Playlist
 *******************/
const playlists = {
  Focus:[
    ['Lo-Fi Beats • Chillhop','https://www.youtube.com/results?search_query=lofi+beats+chillhop'],
    ['Deep Focus • Minimal Techno','https://www.youtube.com/results?search_query=deep+focus+minimal+techno'],
    ['Coding Flow • Instrumental','https://www.youtube.com/results?search_query=coding+instrumental+playlist']
  ],
  Happy:[
    ['Good Vibes • Pop Mix','https://www.youtube.com/results?search_query=happy+pop+mix'],
    ['Bollywood Feel-Good','https://www.youtube.com/results?search_query=bollywood+feel+good+songs'],
    ['Upbeat Indie','https://www.youtube.com/results?search_query=upbeat+indie+playlist']
  ],
  Calm:[
    ['Ambient Piano','https://www.youtube.com/results?search_query=ambient+piano+playlist'],
    ['Rainy Cafe Jazz','https://www.youtube.com/results?search_query=rainy+cafe+jazz'],
    ['Meditation Space','https://www.youtube.com/results?search_query=meditation+music']
  ],
  Sad:[
    ['Soft Acoustic','https://www.youtube.com/results?search_query=sad+acoustic+playlist'],
    ['Retro Soul Ballads','https://www.youtube.com/results?search_query=soul+ballads+playlist'],
    ['Hindi Slow • Emotions','https://www.youtube.com/results?search_query=hindi+sad+songs+playlist']
  ],
  Energetic:[
    ['EDM Power','https://www.youtube.com/results?search_query=edm+power+playlist'],
    ['Gym Hype','https://www.youtube.com/results?search_query=gym+workout+music'],
    ['Punjabi Bangers','https://www.youtube.com/results?search_query=punjabi+party+playlist']
  ],
  Romantic:[
    ['Chill Romance','https://www.youtube.com/results?search_query=romantic+chill+playlist'],
    ['90s Love','https://www.youtube.com/results?search_query=90s+love+songs+playlist'],
    ['Hindi Love Mix','https://www.youtube.com/results?search_query=hindi+romantic+songs+playlist']
  ]
}

$('#genPlaylist').addEventListener('click', ()=>{
  const mood = $('#mood').value; const n = Number($('#songsCount').value||10);
  const list = $('#playlistList'); list.innerHTML='';
  const picks = (playlists[mood]||[]).slice(0,3);
  const extra = Array.from({length: Math.max(0, n - picks.length)}, (_,i)=>[`More ${mood} #${i+1}`, `https://www.youtube.com/results?search_query=${encodeURIComponent(mood+' music playlist')}`]);
  [...picks, ...extra].forEach(([title,url])=>{
    const li = document.createElement('li'); const a=document.createElement('a'); a.href=url; a.target='_blank'; a.textContent=title; li.append(a); list.append(li);
  })
});

/*******************
 * Medical reminders*
 *******************/
const meds = store.get('meds', []);
function saveMeds(){ store.set('meds', meds); renderMeds(); }
function renderMeds(){
  const ul = $('#medList'); ul.innerHTML='';
  meds.sort((a,b)=> (a.time.localeCompare(b.time)) ).forEach((m,i)=>{
    const li = document.createElement('li');
    li.innerHTML = `<strong>${m.name}</strong> — ${m.notes || ''} <span class="pill">${m.date} @ ${m.time}</span> <button class="btn secondary" data-del-med="${i}">Delete</button>`;
    ul.append(li);
  });
  $$('#medList [data-del-med]').forEach(btn=> btn.addEventListener('click', ()=>{ meds.splice(Number(btn.dataset.delMed),1); saveMeds(); }));
}
renderMeds();

$('#addMed').addEventListener('click', ()=>{
  const name=$('#medName').value.trim(); if(!name) return alert('Enter medication/task name');
  const notes=$('#medNotes').value.trim(); const time=$('#medTime').value; const date=$('#medDate').value || todayStr();
  meds.push({name,notes,time,date, notified:false}); saveMeds();
  $('#medName').value=$('#medNotes').value=$('#medTime').value=''; $('#medDate').value='';
});

$('#enableNotif').addEventListener('click', async ()=>{
  try{
    const perm = await Notification.requestPermission();
    alert(perm==='granted' ? 'Notifications enabled' : 'Notifications blocked');
  }catch(e){ alert('Notifications not supported in this browser'); }
});

setInterval(()=>{
  const now = new Date();
  meds.forEach(m=>{
    const due = new Date(`${m.date}T${m.time||'00:00'}`);
    const diff = now - due;
    if(diff>0 && diff < 60*1000 && !m.notified){
      const msg = `${m.name} — ${m.notes||''} (due now)`;
      if('Notification' in window && Notification.permission==='granted') new Notification('Reminder', {body: msg});
      else alert(msg);
      m.notified = true; saveMeds();
    }
  })
}, 30*1000);

/*******************
 * Initial setup
 *******************/
$('#date').value = todayStr();
$('#category').innerHTML = state.categories.map(c=>`<option>${c}</option>`).join('');

refreshUI();
