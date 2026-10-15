// Run: node tests/deadlines.test.js. Uses real deadline/SLA functions without network or a DOM.
process.env.TZ = 'Asia/Ho_Chi_Minh';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const src = fs.readFileSync(require('node:path').join(__dirname, '../js/app.js'), 'utf8');
function readFunction(name) {
  const re = new RegExp('^(?:async )?function ' + name + '\\([^\\n]*', 'm');
  const hit = src.match(re); assert(hit, name);
  if (hit[0].trim().endsWith('}')) return hit[0];
  return src.slice(hit.index, src.indexOf('\n}', hit.index) + 2);
}
let now = Date.parse('2026-12-01T12:00:00+07:00');
class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const H = 3600000, DAY = 86400000, MIN = 60000;
const ctx = vm.createContext({ Date: ClockDate, console, window: {},
  taskDayLabel: d => d.toISOString().slice(0,10), fmtClock: n => new Date(n).toLocaleTimeString('vi-VN'),
  fmtRemainMs: () => 'còn', fmtCountdown: () => 'còn', dashWhen: () => 'giờ hẹn',
  dashHotMin: () => 60, dashIdleHotDays: () => 7, lastTouchMs: () => now,
  sourceDisplay: () => 'nguồn', careLabel: s => s, callResultLabel: () => 'kết quả',
  isQualified: c => !!c.qualified_at, inFunnel: c => ['Đang chăm sóc','Xem dự án','Booking & Làm hồ sơ'].includes(c.care_stage),
  callAttemptsOf: c => c.call_attempts || [], pendingCallsOf: c => (c.call_attempts || []).filter(a=>!a.result),
  daysToBirthday: () => null, formatDuration: () => 'thời gian', formatDob: () => '',
  hhmm: () => 'giờ', CARE_STAGE_NURTURE: 'Nuôi dài hạn', CARE_STAGE_DROPPED: 'Loại', DASH_LEAD_RETRY_H: 24, DASH_IDLE_WARM_DAYS: 14, DASH_BIRTHDAY_DAYS: 7,
  isMine: c => c.owner_id === 'mine', currentUser: {id:'mine'}, showToast() {},
});
vm.runInContext(['startOfDayMs','taskDueMs','openTasksOf','countdownTag','taskDueInfo','callReminder','dashActionGroups'].map(readFunction).join('\n'), ctx);
const iso = ms => new Date(ms).toISOString();
const base = now;
let checks = 0;
function taskCase(label, at, due, allDay, expected, expectedInfo) {
  now = at;
  const task = { due: iso(due), due_allday: allDay, at:'created', text:'Công việc kiểm thử' };
  assert.equal(ctx.countdownTag(due,due,allDay).state,expected,label);
  assert.equal(ctx.taskDueInfo(task).state,expectedInfo,label+' info');
  const c={id:'task',qualified_at:iso(base-DAY),care_stage:'Đang chăm sóc',next_tasks:[task]};
  const item=ctx.dashActionGroups([c]).find(g=>g.key==='tasks').items[0];
  if (item) {
    assert.equal(item.sub.startsWith('Quá hạn'), expected==='missed',label+' dashboard overdue');
    assert.equal(item.sub.startsWith('Đến hạn'), expected==='due',label+' dashboard due');
  }
  checks++;
}
taskCase('before task time',base,base+MIN,false,'soon','today');
taskCase('task starts',base,base,false,'due','due');
taskCase('task grace period',base+29*MIN,base,false,'due','due');
taskCase('task exact grace boundary',base+30*MIN,base,false,'due','due');
taskCase('task after grace',base+30*MIN+1,base,false,'missed','overdue');
const midnight = Date.parse('2026-12-02T00:00:00+07:00');
taskCase('all-day midnight start',midnight-DAY,midnight-1,true,'due','due');
taskCase('all-day noon even if legacy due is midnight',base,base-12*H,true,'due','due');
taskCase('all-day last millisecond',midnight-1,midnight-MIN,true,'due','due');
taskCase('all-day immediately next day',midnight,midnight-MIN,true,'missed','overdue');
taskCase('timed task grace crosses midnight',midnight+10*MIN,midnight-10*MIN,false,'due','due');
taskCase('timed task crosses midnight after grace',midnight+20*MIN+1,midnight-10*MIN,false,'missed','overdue');
for(const [label,at,end,expected] of [
  ['call before start',base-MIN,base+H,'soon'], ['call in window',base+30*MIN,base+H,'due'],
  ['call after window in grace',base+80*MIN,base+H,'due'], ['call exact grace',base+90*MIN,base+H,'due'],
  ['call after grace',base+90*MIN+1,base+H,'missed'], ['call no end in grace',base+30*MIN,null,'due'],
  ['call no end after grace',base+30*MIN+1,null,'missed'],
]) {
  now=at;
  const c={id:'call',qualified_at:iso(base-DAY),care_stage:'Đang chăm sóc',next_call_at:iso(base),next_call_end:end==null?null:iso(end),next_tasks:[]};
  const cd=ctx.countdownTag(base,end??base,false);
  assert.equal(cd.state,expected,label); assert.equal(ctx.callReminder(c).state,expected,label+' customer card');
  const due=ctx.dashActionGroups([c]).find(g=>g.key==='due').items[0];
  if(at>=base) {assert.equal(due.deadlineState,expected,label+' dashboard');assert.equal(due.sub.startsWith('Quá hạn gọi'),expected==='missed',label+' wording');}
  else assert.equal(due,undefined,label+' not yet in due group');
  checks++;
}
assert.equal(ctx.taskDueInfo({due:'invalid'}),null);assert.equal(ctx.taskDueInfo({}),null);
assert.equal(ctx.callReminder({next_call_at:'invalid'}),null);checks+=3;
// Real SLA configuration + automation runner: preserve automatic actions, scope, logging metadata and idempotency.
now=base;
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/velocity.js'),'utf8'),ctx);
ctx.VELOCITY=ctx.window.VELOCITY;
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/followup.js'),'utf8'),ctx);
ctx.FOLLOWUP=ctx.window.FOLLOWUP;
ctx.allCustomers=[
  {id:'care',owner_id:'mine',qualified_at:iso(base-21*DAY),care_stage:'Đang chăm sóc',care_stage_updated_at:iso(base-21*DAY)},
  {id:'approach',owner_id:'mine',care_stage:'Đang tiếp cận',call_attempts:[{at:iso(base-8*DAY),result:'no_answer'}]},
  {id:'other',owner_id:'colleague',qualified_at:iso(base-21*DAY),care_stage:'Đang chăm sóc',care_stage_updated_at:iso(base-21*DAY)},
  {id:'within',owner_id:'mine',qualified_at:iso(base-DAY),care_stage:'Đang chăm sóc',care_stage_updated_at:iso(base-DAY)},
  {id:'visit',owner_id:'mine',qualified_at:iso(base-15*DAY),care_stage:'Xem dự án',care_stage_updated_at:iso(base-15*DAY)},
  {id:'talked',owner_id:'mine',care_stage:'Đang tiếp cận',call_attempts:[{at:iso(base-8*DAY),result:'talked'}]},
];
const expectedRecall=ctx.FOLLOWUP.forStage(ctx.allCustomers[0],'Nuôi dài hạn');
const writes=[];
ctx.CRM={update:async(id,payload,opts)=>{writes.push({id,payload,opts});Object.assign(ctx.allCustomers.find(c=>c.id===id),payload);}};
vm.runInContext('let slaAutoRunning = false;\n'+readFunction('runSlaAutomation'),ctx);
(async()=>{
  assert.equal(await ctx.runSlaAutomation(),true);
  assert.deepEqual(writes.map(x=>x.id),['care','approach']);
  const care=writes[0], lead=writes[1];
  assert.equal(care.payload.care_stage,'Nuôi dài hạn');
  assert.equal(care.opts.historyMeta.auto,'sla');
  assert.equal(care.payload.next_call_at,expectedRecall.start.toISOString());
  assert.equal(care.payload.next_call_end,expectedRecall.end.toISOString());
  assert.equal(lead.payload.disqualify_reason,ctx.VELOCITY.config.dropReason);
  assert.equal(lead.payload.next_call_at,null);
  assert.equal(await ctx.runSlaAutomation(),false);assert.equal(writes.length,2);
  console.log(`Deadlines: ${checks} boundary/invalid-date cases and automatic SLA scope, recall, logging metadata and repeat-run checks passed.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
