const express=require("express"),session=require("express-session"),Database=require("better-sqlite3"),bcrypt=require("bcryptjs"),helmet=require("helmet"),rateLimit=require("express-rate-limit"),path=require("path"),fs=require("fs"),crypto=require("crypto");
// Load local .env values without overriding environment variables supplied by the host.
const envFile=path.resolve(__dirname,'.env');
if(fs.existsSync(envFile)){for(const line of fs.readFileSync(envFile,'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);if(m&&!m[2].startsWith('#')&&process.env[m[1]]===undefined)process.env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2')}}
const missingAdminSettings=["ADMIN_EMAIL","ADMIN_PASSWORD","SESSION_SECRET"].filter(key=>!process.env[key]);
if(missingAdminSettings.length)throw new Error(`Missing required environment settings: ${missingAdminSettings.join(", ")}. Configure them in Admin/.env or the hosting environment.`);
const app=express(),PORT=Number(process.env.PORT||3000),ROOT=__dirname,dataDir=path.resolve(ROOT,"data");
fs.mkdirSync(dataDir,{recursive:true});
const dbFile=path.resolve(ROOT,process.env.DATABASE_FILE||"./data/elevate.sqlite");fs.mkdirSync(path.dirname(dbFile),{recursive:true});
const db=new Database(dbFile);db.pragma("journal_mode=WAL");db.pragma("foreign_keys=ON");
db.exec(`CREATE TABLE IF NOT EXISTS session_store(sid TEXT PRIMARY KEY,sess TEXT NOT NULL,expires_at INTEGER NOT NULL);`);
class SQLiteSessionStore extends session.Store{
  get(sid,cb){try{const r=db.prepare("SELECT sess,expires_at FROM session_store WHERE sid=?").get(sid);if(!r||r.expires_at<=Date.now()){if(r)db.prepare("DELETE FROM session_store WHERE sid=?").run(sid);return cb(null,null)}cb(null,JSON.parse(r.sess))}catch(e){cb(e)}}
  set(sid,sess,cb){try{const expires= sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now()+86400000;db.prepare("INSERT INTO session_store(sid,sess,expires_at) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess,expires_at=excluded.expires_at").run(sid,JSON.stringify(sess),expires);cb&&cb(null)}catch(e){cb&&cb(e)}}
  destroy(sid,cb){try{db.prepare("DELETE FROM session_store WHERE sid=?").run(sid);cb&&cb(null)}catch(e){cb&&cb(e)}}
  touch(sid,sess,cb){this.set(sid,sess,cb)}
}
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,member_id TEXT NOT NULL UNIQUE,name TEXT NOT NULL,email TEXT NOT NULL COLLATE NOCASE UNIQUE,phone TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','admin')),plan TEXT NOT NULL DEFAULT 'Basic',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','paused')),created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS trainers(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,specialty TEXT NOT NULL,experience_years INTEGER NOT NULL DEFAULT 1,bio TEXT NOT NULL,certifications TEXT NOT NULL DEFAULT '',photo_url TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS enquiries(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL,topic TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS reminders(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,audience TEXT NOT NULL,message TEXT NOT NULL,scheduled_at_utc TEXT NOT NULL,display_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',status TEXT NOT NULL DEFAULT 'draft',created_by INTEGER,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),FOREIGN KEY(created_by) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT,transaction_ref TEXT NOT NULL UNIQUE,user_id INTEGER NOT NULL,amount_paise INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),method TEXT NOT NULL DEFAULT 'manual',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,message TEXT NOT NULL,audience TEXT NOT NULL DEFAULT 'all',created_by INTEGER,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),FOREIGN KEY(created_by) REFERENCES users(id));
CREATE INDEX IF NOT EXISTS idx_users_member_id ON users(member_id);CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries(created_at);CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON reminders(scheduled_at_utc);CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id,created_at);`);
const enquiryColumns=db.prepare("PRAGMA table_info(enquiries)").all().map(c=>c.name);
if(!enquiryColumns.includes("place")) db.exec("ALTER TABLE enquiries ADD COLUMN place TEXT NOT NULL DEFAULT ''");
if(!enquiryColumns.includes("converted_user_id")) db.exec("ALTER TABLE enquiries ADD COLUMN converted_user_id INTEGER");
db.exec("UPDATE enquiries SET place=trim(substr(topic,instr(topic,' · ')+3)) WHERE place='' AND instr(topic,' · ')>0");
db.exec("UPDATE enquiries SET topic=trim(substr(topic,1,instr(topic,' · ')-1)) WHERE instr(topic,' · ')>0");
const userColumns=db.prepare("PRAGMA table_info(users)").all().map(c=>c.name);
if(!userColumns.includes("archived_at")) db.exec("ALTER TABLE users ADD COLUMN archived_at TEXT");
if(!userColumns.includes("membership_due_date")) db.exec("ALTER TABLE users ADD COLUMN membership_due_date TEXT");
if(!userColumns.includes("address")) db.exec("ALTER TABLE users ADD COLUMN address TEXT NOT NULL DEFAULT ''");
if(!userColumns.includes("height_cm")) db.exec("ALTER TABLE users ADD COLUMN height_cm REAL");
if(!userColumns.includes("weight_kg")) db.exec("ALTER TABLE users ADD COLUMN weight_kg REAL");
if(!userColumns.includes("profile_photo")) db.exec("ALTER TABLE users ADD COLUMN profile_photo TEXT NOT NULL DEFAULT ''");
for (const [column,type] of [["age","INTEGER"],["gender","TEXT NOT NULL DEFAULT ''"],["fitness_goal","TEXT NOT NULL DEFAULT ''"],["preferred_membership","TEXT NOT NULL DEFAULT ''"],["emergency_contact","TEXT NOT NULL DEFAULT ''"]]) { if(!userColumns.includes(column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} ${type}`); }
if(!userColumns.includes("custom_plan_details")) db.exec("ALTER TABLE users ADD COLUMN custom_plan_details TEXT NOT NULL DEFAULT ''");
if(!userColumns.includes("custom_plan_amount_paise")) db.exec("ALTER TABLE users ADD COLUMN custom_plan_amount_paise INTEGER");
db.exec(`CREATE TABLE IF NOT EXISTS message_templates(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  template_id INTEGER,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  image_data TEXT NOT NULL DEFAULT '',
  recipient_name TEXT NOT NULL DEFAULT '',
  recipient_member_id TEXT NOT NULL DEFAULT '',
  recipient_phone TEXT NOT NULL DEFAULT '',
  delivery_mode TEXT NOT NULL DEFAULT 'manual' CHECK(delivery_mode IN ('manual','automatic')),
  scheduled_at TEXT,
  sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('scheduled','sent','cancelled')),
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(template_id) REFERENCES message_templates(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_messages_schedule ON messages(status,scheduled_at);`);
// Upgrade legacy message records so failures are visible instead of being falsely marked sent.
const messageSchema=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='messages'").get()?.sql||"";
if(!messageSchema.includes("'failed'")){
  db.exec(`DROP INDEX IF EXISTS idx_messages_user; DROP INDEX IF EXISTS idx_messages_schedule;
    ALTER TABLE messages RENAME TO messages_legacy_migration;
    CREATE TABLE messages(
      id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,template_id INTEGER,subject TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',image_data TEXT NOT NULL DEFAULT '',
      delivery_mode TEXT NOT NULL DEFAULT 'manual' CHECK(delivery_mode IN ('manual','automatic')),scheduled_at TEXT,sent_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','scheduled','sent','failed','cancelled')),
      delivery_error TEXT NOT NULL DEFAULT '',provider_message_id TEXT NOT NULL DEFAULT '',delivery_status TEXT NOT NULL DEFAULT '',
      recipient_name TEXT NOT NULL DEFAULT '',recipient_member_id TEXT NOT NULL DEFAULT '',recipient_phone TEXT NOT NULL DEFAULT '',created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(template_id) REFERENCES message_templates(id),FOREIGN KEY(created_by) REFERENCES users(id));
    INSERT INTO messages(id,user_id,template_id,subject,body,image_data,delivery_mode,scheduled_at,sent_at,status,delivery_error,provider_message_id,created_by,created_at)
      SELECT id,user_id,template_id,subject,body,image_data,delivery_mode,scheduled_at,sent_at,status,'','',created_by,created_at FROM messages_legacy_migration;
    DROP TABLE messages_legacy_migration;
    CREATE INDEX idx_messages_user ON messages(user_id,created_at); CREATE INDEX idx_messages_schedule ON messages(status,scheduled_at);`);
}else{
  const cols=db.prepare("PRAGMA table_info(messages)").all().map(c=>c.name);
  if(!cols.includes('delivery_error'))db.exec("ALTER TABLE messages ADD COLUMN delivery_error TEXT NOT NULL DEFAULT ''");
  if(!cols.includes('provider_message_id'))db.exec("ALTER TABLE messages ADD COLUMN provider_message_id TEXT NOT NULL DEFAULT ''");
}
// Provider status is separate from the local queue status: Meta can accept a message
// first and later report sent, delivered, read, or failed through the webhook.
{
  const cols=db.prepare("PRAGMA table_info(messages)").all().map(c=>c.name);
  if(!cols.includes('delivery_status')) db.exec("ALTER TABLE messages ADD COLUMN delivery_status TEXT NOT NULL DEFAULT ''");
}
{
  const columns=db.prepare("PRAGMA table_info(messages)").all(),names=columns.map(c=>c.name),userId=columns.find(c=>c.name==='user_id');
  if(userId?.notnull||!['recipient_name','recipient_member_id','recipient_phone'].every(name=>names.includes(name))){
    db.exec(`DROP INDEX IF EXISTS idx_messages_user; DROP INDEX IF EXISTS idx_messages_schedule;
      CREATE TABLE messages_recipient_migration(
        id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,template_id INTEGER,subject TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',
        image_data TEXT NOT NULL DEFAULT '',delivery_mode TEXT NOT NULL DEFAULT 'manual' CHECK(delivery_mode IN ('manual','automatic')),
        scheduled_at TEXT,sent_at TEXT,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','scheduled','sent','failed','cancelled')),
        delivery_error TEXT NOT NULL DEFAULT '',provider_message_id TEXT NOT NULL DEFAULT '',delivery_status TEXT NOT NULL DEFAULT '',
        recipient_name TEXT NOT NULL DEFAULT '',recipient_member_id TEXT NOT NULL DEFAULT '',recipient_phone TEXT NOT NULL DEFAULT '',
        created_by INTEGER,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(template_id) REFERENCES message_templates(id),FOREIGN KEY(created_by) REFERENCES users(id));
      INSERT INTO messages_recipient_migration(id,user_id,template_id,subject,body,image_data,delivery_mode,scheduled_at,sent_at,status,
        delivery_error,provider_message_id,delivery_status,recipient_name,recipient_member_id,recipient_phone,created_by,created_at)
        SELECT m.id,m.user_id,m.template_id,m.subject,m.body,m.image_data,m.delivery_mode,m.scheduled_at,m.sent_at,m.status,
          m.delivery_error,m.provider_message_id,m.delivery_status,coalesce(u.name,''),coalesce(u.member_id,''),coalesce(u.phone,''),m.created_by,m.created_at
        FROM messages m LEFT JOIN users u ON u.id=m.user_id;
      DROP TABLE messages;
      ALTER TABLE messages_recipient_migration RENAME TO messages;
      CREATE INDEX idx_messages_user ON messages(user_id,created_at);
      CREATE INDEX idx_messages_schedule ON messages(status,scheduled_at);`);
  }
}
const seedTemplates=[
  ["Festival message","festival","Festival Greetings","Wishing you and your family a joyful festival from the Sibi Sports Club team! We hope you have a wonderful celebration."],
  ["Maintenance update","maintenance","Maintenance Update","Hi {{name}}, the club will have a maintenance update on {{date}}. Thank you for your understanding."],
  ["Welcome message","welcome","Welcome to Sibi","Hi {{name}}, welcome to Sibi Sports Club! Your member ID is {{member_id}}. We are excited to have you with us."],
  ["Membership renewal","renewal","Membership Renewal","Hi {{name}}, your Sibi membership is coming up for renewal. Please contact the club team to continue your plan."],
  ["Offers & packages","offers","Special Offer","Hi {{name}}, we have a new membership offer and package update for you. Contact the Sibi team to learn more."],
  ["Custom message","custom","Message from Sibi","Hi {{name}}, greetings from Sibi Sports Club!"]
];
const templateInsert=db.prepare("INSERT OR IGNORE INTO message_templates(name,category,subject,body) VALUES(?,?,?,?)");
seedTemplates.forEach(t=>templateInsert.run(...t));
const clubTrainers=[
  ["Mahalingam","Personal Training",8,"Experienced in providing personalized training sessions and helping members work toward their fitness goals.","Personal Training"],
  ["Ameen","Personal Training",8,"Experienced coach focused on structured one-to-one training and individualized fitness plans.","Personal Training"],
  ["Rajesh","Personal Training",8,"Provides personalized coaching and progressive training plans tailored to each member.","Personal Training"],
  ["Ramesh","Personal Training",8,"Helps members build consistent training routines with guidance tailored to their individual goals.","Personal Training"]
];
const trainerNames=new Set(db.prepare("SELECT name FROM trainers WHERE active=1").all().map(x=>x.name));
if(trainerNames.has("Arjun Menon")||trainerNames.has("Priya Raman")||trainerNames.has("Karthik Iyer")){db.prepare("UPDATE trainers SET active=0 WHERE name IN ('Arjun Menon','Priya Raman','Karthik Iyer')").run()}
const addTrainer=db.prepare("INSERT INTO trainers(name,specialty,experience_years,bio,certifications) VALUES(?,?,?,?,?)");
const updateTrainer=db.prepare("UPDATE trainers SET specialty=?,experience_years=?,bio=?,certifications=? WHERE name=? AND active=1");
clubTrainers.forEach(([name,specialty,experience,bio,certifications])=>{if(db.prepare("SELECT id FROM trainers WHERE name=? AND active=1").get(name))updateTrainer.run(specialty,experience,bio,certifications,name);else addTrainer.run(name,specialty,experience,bio,certifications)});
async function seedAdmin(){const email=String(process.env.ADMIN_EMAIL).trim().toLowerCase(),password=String(process.env.ADMIN_PASSWORD);const hash=await bcrypt.hash(password,12);const old=db.prepare("SELECT id FROM users WHERE email=? OR member_id='SSC-ADMIN'").get(email);if(!old){db.prepare("INSERT INTO users(member_id,name,email,phone,password_hash,role,plan,status) VALUES(?,?,?,?,?,'admin','Staff','active')").run("SSC-ADMIN",process.env.ADMIN_NAME||"Sibi Administrator",email,"Not provided",hash)}else db.prepare("UPDATE users SET email=?,name=?,password_hash=?,role='admin',status='active' WHERE id=?").run(email,process.env.ADMIN_NAME||"Sibi Administrator",hash,old.id)}
const SCHEDULE_POLL_INTERVAL_MS=5000;
app.disable("x-powered-by");app.get("/health",(req,res)=>res.json({ok:true,service:"sibi-sports-club",scheduler:"running",scheduler_interval_ms:SCHEDULE_POLL_INTERVAL_MS,time:new Date().toISOString()}));app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:"3mb"}));app.use(express.urlencoded({extended:false,limit:"100kb"}));
if(process.env.TRUST_PROXY==="1")app.set("trust proxy",1);
app.use(session({store:new SQLiteSessionStore(),secret:process.env.SESSION_SECRET,resave:false,saveUninitialized:false,name:"sibi.sid",rolling:true,cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:28800000}}));
app.use("/api/auth",rateLimit({windowMs:900000,limit:30,standardHeaders:true,legacyHeaders:false}));
app.use("/api",(req,res,next)=>{res.set("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");res.set("Pragma","no-cache");res.set("Expires","0");next()});
const clean=(v,n=500)=>typeof v==="string"?v.trim().slice(0,n):"";
const membershipPlans=[
  {name:"Strength Training · 1 Month",price:900},
  {name:"Strength Training · 3 Months",price:2000},
  {name:"Strength Training · 6 Months",price:4000},
  {name:"Strength Training · 1 Year",price:5999},
  {name:"Strength & Cardio · 1 Month",price:1400},
  {name:"Strength & Cardio · 3 Months",price:3500},
  {name:"Strength & Cardio · 6 Months",price:6000},
  {name:"Strength & Cardio · 1 Year",price:9999},
  {name:"Personal Training",price:null},
  {name:"Cardio",price:null}
];
const legacyMembershipPlans=["Basic","Premium","Elite"];
function validMembershipPlan(plan){return membershipPlans.some(option=>option.name===plan)||legacyMembershipPlans.includes(plan)}
function adminPlanDetails(plan,details,amount){
 if(membershipPlans.some(option=>option.name===plan)||legacyMembershipPlans.includes(plan))return{valid:true,details:"",amountPaise:null};
 const cleanDetails=clean(details,120),numericAmount=Number(amount);
 if(plan!=="Custom"||cleanDetails.length<2||!Number.isFinite(numericAmount)||numericAmount<=0||numericAmount>10000000)return{valid:false,details:"",amountPaise:null};
 return{valid:true,details:cleanDetails,amountPaise:Math.round(numericAmount*100)};
}
function membershipPlanFromPreference(preference){
 const normalized=String(preference||"").toLowerCase();
 const selected=membershipPlans.find(option=>normalized.startsWith(option.name.toLowerCase()));
 return selected?.name||null;
}
function parseScheduledDate(value){
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value||''));
  if(!match)return new Date(Number.NaN);
  const [,year,month,day,hour,minute]=match.map(Number);
  const localAsUtc=new Date(Date.UTC(year,month-1,day,hour,minute));
  if(localAsUtc.getUTCFullYear()!==year||localAsUtc.getUTCMonth()!==month-1||localAsUtc.getUTCDate()!==day||localAsUtc.getUTCHours()!==hour||localAsUtc.getUTCMinutes()!==minute)return new Date(Number.NaN);
  return new Date(localAsUtc.getTime()-330*60*1000);
}
// Meta webhook verification and delivery receipts. Set WHATSAPP_WEBHOOK_VERIFY_TOKEN in hosting settings.
app.get('/api/whatsapp/webhook',(req,res)=>{
  const mode=req.query['hub.mode'],token=req.query['hub.verify_token'],challenge=req.query['hub.challenge'];
  if(mode==='subscribe' && process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token===process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) return res.status(200).send(String(challenge||''));
  return res.sendStatus(403);
});
app.post('/api/whatsapp/webhook',(req,res)=>{
  // If APP_SECRET is configured, verify the webhook signature before trusting status updates.
  const appSecret=process.env.WHATSAPP_APP_SECRET,signature=req.get('x-hub-signature-256');
  if(appSecret){
    const expected='sha256='+crypto.createHmac('sha256',appSecret).update(JSON.stringify(req.body)).digest('hex');
    const a=Buffer.from(String(signature||'')),b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return res.sendStatus(401);
  }
  try{
    for(const entry of (req.body?.entry||[])) for(const change of (entry.changes||[])) for(const item of (change.value?.statuses||[])){
      const id=String(item.id||''); const state=String(item.status||'').toLowerCase();
      if(!id||!['sent','delivered','read','failed'].includes(state)) continue;
      const error=state==='failed'?(item.errors||[]).map(e=>e.error_data?.details||e.message||e.title||'WhatsApp reported delivery failure').join('; ').slice(0,500):'';
      db.prepare("UPDATE messages SET delivery_status=?,delivery_error=CASE WHEN ?<>'' THEN ? ELSE delivery_error END WHERE provider_message_id=?").run(state,error,error,id);
    }
    return res.sendStatus(200);
  }catch(e){console.error('WhatsApp webhook processing failed:',e);return res.sendStatus(500)}
});
function normalizeEmail(email,memberId){return email||`${memberId}@member.local`}
function displayUser(u){if(!u)return u;return {...u,email:(u.email||"").endsWith("@member.local")?"":u.email}}
function me(req){return req.session.userId?displayUser(db.prepare("SELECT id,member_id,name,email,phone,address,role,plan,custom_plan_details,custom_plan_amount_paise,status,membership_due_date,height_cm,weight_kg,profile_photo,age,gender,fitness_goal,preferred_membership,emergency_contact,created_at FROM users WHERE id=? AND (role='admin' OR archived_at IS NULL)").get(req.session.userId)||null):null}
function auth(req,res,next){const u=me(req);if(!u)return res.status(401).json({error:"Please sign in to continue."});req.user=u;next()}
function admin(req,res,next){const u=me(req);if(!u||u.role!=="admin")return res.status(403).json({error:"Administrator access required."});req.user=u;next()}
function makeMemberId(){const year=new Date().getUTCFullYear(),prefix=`SSC-${year}-`,last=db.prepare("SELECT member_id FROM users WHERE member_id LIKE ? ORDER BY id DESC LIMIT 1").get(`${prefix}%`);return `${prefix}${String(last?Number(last.member_id.slice(prefix.length))+1:1).padStart(6,"0")}`}
const createMember=db.transaction(data=>{
  const id=makeMemberId(),email=normalizeEmail(data.email,id);
  const r=db.prepare("INSERT INTO users(member_id,name,email,phone,address,password_hash,role,plan,custom_plan_details,custom_plan_amount_paise,status,age,gender,fitness_goal,preferred_membership,emergency_contact,height_cm,weight_kg,profile_photo) VALUES(?,?,?,?,?,?,'member',?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id,data.name,email,data.phone,data.address||"",data.hash,data.plan||membershipPlans[0].name,data.customPlanDetails||"",data.customPlanAmountPaise||null,data.status||"pending",data.age||null,data.gender||"",data.fitness_goal||"",data.preferred_membership||"",data.emergency_contact||"",data.height_cm||null,data.weight_kg||null,data.profile_photo||"");
  return displayUser(db.prepare("SELECT id,member_id,name,email,phone,address,role,plan,custom_plan_details,custom_plan_amount_paise,status,membership_due_date,height_cm,weight_kg,profile_photo,age,gender,fitness_goal,preferred_membership,emergency_contact,created_at FROM users WHERE id=?").get(r.lastInsertRowid));
});
app.get("/api/health",(req,res)=>res.json({ok:true,timezone:process.env.APP_TIMEZONE||"Asia/Kolkata"}));
app.post("/api/auth/register",async(req,res)=>{const name=clean(req.body.name,100),email=clean(req.body.email,160).toLowerCase(),phone=clean(req.body.phone,30),address=clean(req.body.address,300),age=Number(req.body.age),gender=clean(req.body.gender,30),fitness_goal=Array.isArray(req.body.fitness_goal)?req.body.fitness_goal.map(v=>clean(v,60)).filter(Boolean).join(", "):clean(req.body.fitness_goal,300),preferred_membership=clean(req.body.preferred_membership,100),emergency_contact=clean(req.body.emergency_contact,30),plan=membershipPlanFromPreference(preferred_membership);if(name.length<2||phone.length<7||!Number.isInteger(age)||age<12||age>100||!gender||!address||!fitness_goal||!plan||emergency_contact.length<7||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Please complete your name, phone, address, fitness goal, preferred membership and emergency contact. Email is optional."});try{const tempPassword=`Sibi@${Math.random().toString(36).slice(2,8).toUpperCase()}!`;const user=createMember({name,email,phone,address,age,gender,fitness_goal,preferred_membership,emergency_contact,plan,status:"pending",hash:await bcrypt.hash(tempPassword,12)});req.session.userId=user.id;res.status(201).json({user,temporaryPassword:tempPassword,message:"Registration submitted successfully."})}catch(e){if(String(e.code||"").startsWith("SQLITE_CONSTRAINT"))return res.status(409).json({error:"An account with that email or phone already exists."});console.error(e);res.status(500).json({error:"Could not complete registration."})}});
app.post("/api/auth/login",async(req,res)=>{const identifier=clean(req.body.email||req.body.identifier,160).toLowerCase(),password=typeof req.body.password==="string"?req.body.password:"",u=db.prepare("SELECT * FROM users WHERE (lower(email)=? OR lower(member_id)=?) AND (role='admin' OR archived_at IS NULL)").get(identifier,identifier);if(!u||!(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:"Member ID/email or password is incorrect."});req.session.userId=u.id;const user=me(req);res.json({user,redirect:user.role==="admin"?"/admin.html":"/member.html"})});
app.post("/api/auth/logout",(req,res)=>req.session.destroy(e=>{if(e)return res.status(500).json({error:"Could not sign out."});res.clearCookie("sibi.sid",{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production"});res.json({ok:true})}));
app.get("/api/auth/me",auth,(req,res)=>res.json({user:req.user}));
app.get("/api/trainers",(req,res)=>res.json({trainers:db.prepare("SELECT id,name,specialty,experience_years,bio,certifications,photo_url FROM trainers WHERE active=1 ORDER BY id").all()}));
app.post("/api/enquiries",(req,res)=>{const name=clean(req.body.name,100),phone=clean(req.body.phone,30),email=clean(req.body.email,160).toLowerCase(),place=clean(req.body.place,160),topic=clean(req.body.topic,100)||"General enquiry",message=clean(req.body.message,2000);if(name.length<2||phone.length<7||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||place.length<2||message.length<5)return res.status(400).json({error:"Please complete your name, phone, place and message. Email is optional."});const r=db.prepare("INSERT INTO enquiries(name,phone,email,place,topic,message) VALUES(?,?,?,?,?,?)").run(name,phone,email,place,topic,message);res.status(201).json({ok:true,enquiryId:r.lastInsertRowid})});
app.get("/api/member/dashboard",auth,(req,res)=>{if(req.user.role!=="member")return res.status(403).json({error:"Please use the admin dashboard."});const latestPayment=db.prepare("SELECT status FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 1").get(req.user.id);res.json({user:req.user,paymentStatus:latestPayment?.status||"pending",planOptions:membershipPlans})});
app.patch("/api/member/profile",auth,(req,res)=>{
if(req.user.role!=="member")return res.status(403).json({error:"Member account required."});
const name=clean(req.body.name,100),email=clean(req.body.email,160).toLowerCase(),phone=clean(req.body.phone,30),address=clean(req.body.address,250);
if(name.length<2||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone.length<7)return res.status(400).json({error:"Enter a valid name, optional email and WhatsApp/phone number."});
try{db.prepare("UPDATE users SET name=?,email=?,phone=?,address=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(name,normalizeEmail(email,req.user.member_id),phone,address,req.user.id);res.json({user:me(req)});}catch(e){if(String(e.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"That email address is already in use."});throw e;}
});
app.get("/api/member/payments",auth,(req,res)=>{if(req.user.role!=="member")return res.status(403).json({error:"Member account required."});res.json({payments:db.prepare("SELECT transaction_ref,amount_paise,status,method,notes,created_at FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 100").all(req.user.id)});});
app.patch("/api/member/plan",auth,(req,res)=>{if(req.user.role!=="member")return res.status(403).json({error:"Member account required."});const plan=clean(req.body.plan,60);if(plan==="Custom"&&req.user.plan==="Custom")return res.json({user:req.user,message:"Your custom package selection is unchanged."});if(!validMembershipPlan(plan))return res.status(400).json({error:"Select a valid membership plan from the available packages."});db.prepare("UPDATE users SET plan=?,custom_plan_details='',custom_plan_amount_paise=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(plan,req.user.id);res.json({user:me(req),message:"Package selection saved."})});
app.get("/api/admin/dashboard",admin,(req,res)=>res.json({admin:req.user,stats:{members:db.prepare("SELECT COUNT(*) n FROM users WHERE role='member' AND archived_at IS NULL").get().n,activeMembers:db.prepare("SELECT COUNT(*) n FROM users WHERE role='member' AND archived_at IS NULL AND status='active'").get().n,pendingMembers:db.prepare("SELECT COUNT(*) n FROM users WHERE role='member' AND archived_at IS NULL AND status='pending'").get().n,pausedMembers:db.prepare("SELECT COUNT(*) n FROM users WHERE role='member' AND archived_at IS NULL AND status='paused'").get().n,trainers:db.prepare("SELECT COUNT(*) n FROM trainers WHERE active=1").get().n,enquiries:db.prepare("SELECT COUNT(*) n FROM enquiries WHERE status='new'").get().n,pendingPayments:db.prepare("SELECT COUNT(*) n FROM payments WHERE status='pending'").get().n,dueSoon:db.prepare("SELECT COUNT(*) n FROM users WHERE role='member' AND archived_at IS NULL AND membership_due_date IS NOT NULL AND date(membership_due_date)<=date('now','+7 day')").get().n}}));
app.post("/api/admin/members",admin,async(req,res)=>{
const name=clean(req.body.name,100),email=clean(req.body.email,160).toLowerCase(),phone=clean(req.body.phone,30),plan=clean(req.body.plan,60)||membershipPlans[0].name,status=clean(req.body.status,20)||"active",height=Number(req.body.height_cm)||null,weight=Number(req.body.weight_kg)||null,photo=clean(req.body.profile_photo,2500000),due=clean(req.body.membership_due_date,30),customPlan=adminPlanDetails(plan,req.body.custom_plan_details,req.body.custom_plan_amount);
if(name.length<2||phone.length<7||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!customPlan.valid||!["pending","active","paused"].includes(status))return res.status(400).json({error:"Enter name, phone and valid plan details. Custom plans need a description and amount greater than zero."});
if(db.prepare("SELECT id FROM users WHERE role='member' AND phone=?").get(phone))return res.status(409).json({error:"That phone number is already registered."});
if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return res.status(400).json({error:"Membership due date must use YYYY-MM-DD."});
const tempPassword=`Sibi@${Math.random().toString(36).slice(2,8).toUpperCase()}!`;
try{const user=createMember({name,email,phone,hash:await bcrypt.hash(tempPassword,12),plan,customPlanDetails:customPlan.details,customPlanAmountPaise:customPlan.amountPaise,status,height_cm:height,weight_kg:weight,profile_photo:photo});db.prepare("UPDATE users SET membership_due_date=? WHERE id=?").run(due||null,user.id);res.status(201).json({user:displayUser(db.prepare("SELECT id,member_id,name,email,phone,address,plan,custom_plan_details,custom_plan_amount_paise,status,membership_due_date,height_cm,weight_kg,profile_photo,age,gender,fitness_goal,preferred_membership,emergency_contact,created_at FROM users WHERE id=?").get(user.id)),temporaryPassword:tempPassword,message:"Member created successfully."});}catch(e){if(String(e.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"That email address is already used by another account."});console.error(e);res.status(500).json({error:"Could not create member."})}
});
const memberSelect=`SELECT u.id,u.member_id,u.name,u.email,u.phone,u.address,u.plan,u.custom_plan_details,u.custom_plan_amount_paise,u.status,u.archived_at,u.membership_due_date,u.height_cm,u.weight_kg,u.profile_photo,u.age,u.gender,u.fitness_goal,u.preferred_membership,u.emergency_contact,u.created_at,u.updated_at,(SELECT p.status FROM payments p WHERE p.user_id=u.id ORDER BY p.id DESC LIMIT 1) AS payment_status,(SELECT p.method FROM payments p WHERE p.user_id=u.id ORDER BY p.id DESC LIMIT 1) AS payment_method,(SELECT p.created_at FROM payments p WHERE p.user_id=u.id ORDER BY p.id DESC LIMIT 1) AS last_payment_at FROM users u WHERE u.role='member'`;
app.get("/api/admin/members",admin,(req,res)=>{const removed=req.query.archived==="1";res.json({members:db.prepare(`${memberSelect} AND u.archived_at IS ${removed?"NOT ":""}NULL ORDER BY u.id DESC LIMIT 1000`).all(),fetched_at:new Date().toISOString()})});
app.get("/api/admin/members/:id",admin,(req,res)=>{const id=Number(req.params.id),member=db.prepare(`${memberSelect} AND u.id=?`).get(id);if(!member)return res.status(404).json({error:"Member not found."});res.json({member,fetched_at:new Date().toISOString()})});
app.delete("/api/admin/members/:id",admin,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({error:"Invalid member."});
  const archiveMember=db.transaction(()=>{
    const result=db.prepare("UPDATE users SET archived_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND role='member' AND archived_at IS NULL").run(id);
    if(!result.changes)return false;
    db.prepare("UPDATE messages SET status='cancelled',delivery_status='cancelled',delivery_error='Cancelled because this member was removed.' WHERE user_id=? AND status IN ('pending','scheduled')").run(id);
    return true;
  });
  if(!archiveMember())return res.status(404).json({error:"Member not found or already removed."});
  res.json({ok:true,message:"Member removed from the active list. Payment and message history has been preserved."});
});
app.patch("/api/admin/members/:id/restore",admin,(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({error:"Invalid member."});
  const result=db.prepare("UPDATE users SET archived_at=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND role='member' AND archived_at IS NOT NULL").run(id);
  if(!result.changes)return res.status(404).json({error:"Removed member not found."});
  res.json({ok:true,message:"Member restored to the active member list."});
});
app.patch("/api/admin/members/:id",admin,(req,res)=>{
const id=Number(req.params.id),name=clean(req.body.name,100),email=clean(req.body.email,160).toLowerCase(),phone=clean(req.body.phone,30),address=clean(req.body.address,250),plan=clean(req.body.plan,60),status=clean(req.body.status,20),due=clean(req.body.membership_due_date,30),height=Number(req.body.height_cm)||null,weight=Number(req.body.weight_kg)||null,photo=clean(req.body.profile_photo,2500000),paymentStatus=clean(req.body.payment_status,20),customPlan=adminPlanDetails(plan,req.body.custom_plan_details,req.body.custom_plan_amount);
if(!Number.isInteger(id)||id<1||name.length<2||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||phone.length<7||!customPlan.valid||!["pending","active","paused"].includes(status)||paymentStatus&&!["pending","completed","failed"].includes(paymentStatus))return res.status(400).json({error:"Check the customer name, email, phone, plan details, membership status and payment status. Custom plans need a description and amount greater than zero."});
if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return res.status(400).json({error:"Membership due date must use YYYY-MM-DD."});
try{const member=db.prepare("SELECT member_id FROM users WHERE id=? AND role='member' AND archived_at IS NULL").get(id);if(!member)return res.status(404).json({error:"Member not found."});const duplicate=db.prepare("SELECT id FROM users WHERE role='member' AND phone=? AND id<>?").get(phone,id);if(duplicate)return res.status(409).json({error:"That phone number is already registered to another member."});db.prepare("UPDATE users SET name=?,email=?,phone=?,address=?,plan=?,custom_plan_details=?,custom_plan_amount_paise=?,status=?,membership_due_date=?,height_cm=?,weight_kg=?,profile_photo=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND role='member' AND archived_at IS NULL").run(name,normalizeEmail(email,member.member_id),phone,address,plan,customPlan.details,customPlan.amountPaise,status,due||null,height,weight,photo,id);if(paymentStatus){const latest=db.prepare("SELECT id FROM payments WHERE user_id=? ORDER BY id DESC LIMIT 1").get(id);if(latest)db.prepare("UPDATE payments SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(paymentStatus,latest.id)}res.json({ok:true,member:db.prepare(`${memberSelect} AND u.id=?`).get(id)});}catch(e){if(String(e.code||"").includes("CONSTRAINT"))return res.status(409).json({error:"That email address is already used by another account."});console.error("Member update failed:",e);return res.status(500).json({error:"Could not save member changes. Check the server log for details."});}
});
app.patch("/api/admin/members/:id/status",admin,(req,res)=>{const status=clean(req.body.status,20);if(!["pending","active","paused"].includes(status))return res.status(400).json({error:"Invalid member status."});const r=db.prepare("UPDATE users SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND role='member' AND archived_at IS NULL").run(status,Number(req.params.id));if(!r.changes)return res.status(404).json({error:"Member not found."});res.json({ok:true})});
app.get("/api/admin/payments",admin,(req,res)=>res.json({payments:db.prepare(`SELECT p.id,p.transaction_ref,p.user_id,u.member_id,u.name,u.email,u.phone,p.amount_paise,p.status,p.method,p.notes,p.created_at,p.updated_at FROM payments p JOIN users u ON u.id=p.user_id WHERE u.role='member' ORDER BY p.id DESC LIMIT 1000`).all()}));
app.post("/api/admin/payments",admin,(req,res)=>{
const userId=Number(req.body.user_id),amount=Number(req.body.amount),status=clean(req.body.status,20),method=clean(req.body.method,40)||"cash",notes=clean(req.body.notes,500);
if(!Number.isInteger(userId)||userId<1||!Number.isFinite(amount)||amount<=0||amount>10000000||!["pending","completed","failed"].includes(status)||!["cash","card","gpay","bank_transfer"].includes(method))return res.status(400).json({error:"Choose a customer, valid amount, status and payment method."});
if(!db.prepare("SELECT id FROM users WHERE id=? AND role='member'").get(userId))return res.status(404).json({error:"Member not found."});
const ref=`SSC-MAN-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
const r=db.prepare("INSERT INTO payments(transaction_ref,user_id,amount_paise,status,method,notes) VALUES(?,?,?,?,?,?)").run(ref,userId,Math.round(amount*100),status,method,notes);
res.status(201).json({payment:db.prepare("SELECT * FROM payments WHERE id=?").get(r.lastInsertRowid),message:"Payment record saved."});
});
app.patch("/api/admin/payments/:id",admin,(req,res)=>{
const status=clean(req.body.status,20);if(!["pending","completed","failed"].includes(status))return res.status(400).json({error:"Invalid payment status."});
const r=db.prepare("UPDATE payments SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(status,Number(req.params.id));
if(!r.changes)return res.status(404).json({error:"Payment record not found."});res.json({ok:true});
});
app.get("/api/admin/templates",admin,(req,res)=>res.json({templates:db.prepare("SELECT id,name,category,subject,body,created_at,updated_at FROM message_templates ORDER BY id").all()}));
app.post("/api/admin/templates",admin,(req,res)=>{const name=clean(req.body.name,100),category=clean(req.body.category,40),subject=clean(req.body.subject,160),body=clean(req.body.body,3000);if(!name||!category||!body)return res.status(400).json({error:"Template name, category and message are required."});const existing=db.prepare("SELECT id FROM message_templates WHERE lower(name)=lower(?)").get(name);if(existing){db.prepare("UPDATE message_templates SET category=?,subject=?,body=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(category,subject,body,existing.id);return res.json({template:db.prepare("SELECT * FROM message_templates WHERE id=?").get(existing.id),updated:true,message:"Template updated in your library."})}const r=db.prepare("INSERT INTO message_templates(name,category,subject,body) VALUES(?,?,?,?)").run(name,category,subject,body);res.status(201).json({template:db.prepare("SELECT * FROM message_templates WHERE id=?").get(r.lastInsertRowid),message:"Template saved to your library."})});
app.patch("/api/admin/templates/:id",admin,(req,res)=>{const name=clean(req.body.name,100),category=clean(req.body.category,40),subject=clean(req.body.subject,160),body=clean(req.body.body,3000);if(!name||!category||!body)return res.status(400).json({error:"Template name, category and message are required."});const r=db.prepare("UPDATE message_templates SET name=?,category=?,subject=?,body=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(name,category,subject,body,Number(req.params.id));if(!r.changes)return res.status(404).json({error:"Template not found."});res.json({template:db.prepare("SELECT * FROM message_templates WHERE id=?").get(Number(req.params.id))})});
app.delete("/api/admin/templates/:id",admin,(req,res)=>{const r=db.prepare("DELETE FROM message_templates WHERE id=?").run(Number(req.params.id));if(!r.changes)return res.status(404).json({error:"Template not found."});res.json({ok:true})});
app.get("/api/admin/whatsapp/status",admin,async(req,res)=>{
  const provider=activeWhatsAppProvider();
  if(provider==='openwa'){
    if(!openWaConfigured())return res.json({provider,configured:false,connected:false,message:'OpenWA is selected but not configured. Set OPENWA_API_URL, OPENWA_API_KEY and OPENWA_SESSION_ID on the server.'});
    try{
      const session=await openWaRequest(`/sessions/${encodeURIComponent(process.env.OPENWA_SESSION_ID)}`);
      const connected=session.status==='ready';
      return res.json({provider,configured:true,connected,sessionStatus:session.status||'unknown',message:connected?'OpenWA is connected and ready to send.':'OpenWA session is not ready. Link or reconnect it in the OpenWA dashboard.'});
    }catch(e){return res.status(503).json({error:`OpenWA could not be reached: ${String(e.message||e).slice(0,300)}`})}
  }
  if(provider==='cloud_api')return res.json({provider,configured:whatsappConfigured('cloud_api'),connected:whatsappConfigured('cloud_api'),message:whatsappConfigured('cloud_api')?'Meta WhatsApp Cloud API is configured.':'Meta WhatsApp Cloud API credentials are missing.'});
  return res.json({provider:'manual',configured:false,connected:false,message:'No automatic WhatsApp sender is configured. Messages will be prepared for manual sending.'});
});
app.get("/api/admin/messages/ready",admin,(req,res)=>res.json({ids:db.prepare("SELECT id FROM messages WHERE delivery_status='manual_ready' ORDER BY id DESC LIMIT 500").all().map(row=>row.id)}));
app.get("/api/admin/messages",admin,(req,res)=>res.json({messages:db.prepare(`SELECT m.id,m.user_id,coalesce(nullif(m.recipient_member_id,''),u.member_id,'Enquiry') AS member_id,coalesce(nullif(m.recipient_name,''),u.name,'Unknown recipient') AS name,coalesce(nullif(m.recipient_phone,''),u.phone,'') AS phone,m.subject,m.body,m.image_data,m.delivery_mode,m.scheduled_at,m.sent_at,m.status,m.delivery_status,m.delivery_error,m.template_id,m.provider_message_id,m.created_at,t.name AS template_name FROM messages m LEFT JOIN users u ON u.id=m.user_id LEFT JOIN message_templates t ON t.id=m.template_id ORDER BY m.id DESC LIMIT 500`).all()}));
app.post("/api/admin/messages/:id/complete",admin,(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({error:"Invalid reminder."});const result=db.prepare("UPDATE messages SET status='sent',sent_at=?,delivery_status='manual_sent',delivery_error='Marked complete manually; WhatsApp delivery was not verified.' WHERE id=? AND delivery_status='manual_ready' AND status='pending'").run(new Date().toISOString(),id);if(!result.changes)return res.status(409).json({error:"This reminder is no longer waiting to be marked complete. Refresh delivery history."});res.json({ok:true,message:"Reminder marked completed. WhatsApp delivery was not verified."})});
function openWaConfigured(){return Boolean(process.env.OPENWA_API_URL&&process.env.OPENWA_API_KEY&&process.env.OPENWA_SESSION_ID)}
function cloudApiConfigured(){return Boolean(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID)}
function activeWhatsAppProvider(){
  const configured=String(process.env.WHATSAPP_PROVIDER||'').trim().toLowerCase();
  if(configured==='openwa')return 'openwa';
  if(configured==='cloud_api'||configured==='cloud-api')return 'cloud_api';
  if(configured==='manual'||configured==='none')return 'manual';
  if(openWaConfigured())return 'openwa';
  if(cloudApiConfigured())return 'cloud_api';
  return 'manual';
}
function whatsappConfigured(provider=activeWhatsAppProvider()){
  return provider==='openwa'?openWaConfigured():provider==='cloud_api'?cloudApiConfigured():false;
}
function whatsappPhone(value){let digits=String(value||'').replace(/\D/g,'');if(digits.length===10)digits='91'+digits;return digits.length>=11&&digits.length<=15?digits:''}
async function openWaRequest(endpoint,options={}){
  const base=String(process.env.OPENWA_API_URL||'').trim().replace(/\/+$/,'');
  let parsed;
  try{parsed=new URL(base)}catch{throw new Error('OPENWA_API_URL must be a valid absolute URL ending in /api.')}
  if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('OPENWA_API_URL must use HTTP(S) and must not include credentials, query parameters or a fragment.');
  if(!parsed.pathname.replace(/\/+$/,'').endsWith('/api'))throw new Error('OPENWA_API_URL must include the OpenWA /api path, for example http://localhost:2785/api.');
  const response=await fetch(`${base}${endpoint}`,{...options,headers:{'X-API-Key':process.env.OPENWA_API_KEY,...(options.headers||{})},signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error((Array.isArray(data.message)?data.message.join('; '):data.message)||data.error||`OpenWA request failed (${response.status}).`);
  return data;
}
async function sendOpenWaMessage(row,user){
  if(!openWaConfigured())throw new Error('OpenWA delivery is not configured. Set OPENWA_API_URL, OPENWA_API_KEY and OPENWA_SESSION_ID on the server.');
  const digits=whatsappPhone(user.phone);if(!digits)throw new Error('Member phone number is not a valid international WhatsApp number.');
  const session=encodeURIComponent(process.env.OPENWA_SESSION_ID),chatId=`${digits}@c.us`,headers={'Content-Type':'application/json','Idempotency-Key':`sibi-message-${row.id}`};
  let endpoint=`/sessions/${session}/messages/send-text`,payload={chatId,text:row.body};
  if(row.image_data){
    const match=row.image_data.match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/i);
    if(!match)throw new Error('The attached image is invalid. Please upload a PNG, JPG or WebP image.');
    if(String(row.body).length>1024)throw new Error('OpenWA image captions must be 1024 characters or fewer. Remove the image or shorten the message.');
    endpoint=`/sessions/${session}/messages/send-image`;
    payload={chatId,base64:match[2],mimetype:match[1],caption:row.body};
  }
  const result=await openWaRequest(endpoint,{method:'POST',headers,body:JSON.stringify(payload)});
  if(!result.messageId)throw new Error('OpenWA accepted no message identifier. Check the OpenWA response and session status before retrying.');
  return String(result.messageId);
}
async function sendWhatsAppMessage(row,user){
  const provider=activeWhatsAppProvider();
  if(provider==='openwa')return sendOpenWaMessage(row,user);
  if(provider!=='cloud_api'||!cloudApiConfigured())throw new Error('No automatic WhatsApp sender is configured. Configure OpenWA or Meta WhatsApp Cloud API on the server.');
  const to=whatsappPhone(user.phone);if(!to)throw new Error('Member phone number is not a valid international WhatsApp number.');
  const version=process.env.WHATSAPP_GRAPH_VERSION||'v22.0';const base=`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;const headers={Authorization:`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`};
  // Business-initiated messages outside the 24-hour customer-service window generally
  // require an approved template. Configure a template with one body variable ({{1}})
  // and set WHATSAPP_TEMPLATE_NAME + WHATSAPP_TEMPLATE_LANGUAGE to use it.
  let payload;
  if(process.env.WHATSAPP_TEMPLATE_NAME){
    payload={messaging_product:'whatsapp',to,type:'template',template:{name:process.env.WHATSAPP_TEMPLATE_NAME,language:{code:process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en_US'},components:[{type:'body',parameters:[{type:'text',text:String(row.body).slice(0,1024)}]}]}};
  }else{
    payload={messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',text:{preview_url:false,body:row.body}};
  }
  if(row.image_data){
    if(process.env.WHATSAPP_TEMPLATE_NAME) throw new Error('Image attachments with approved-template mode are not enabled. Send the template text first or disable template mode for recipients inside the 24-hour window.');
    const match=row.image_data.match(/^data:(image\/(?:png|jpeg|webp));base64,([\s\S]+)$/i);if(!match)throw new Error('The attached image is invalid. Please upload a PNG, JPG or WebP image.');
    const bytes=Buffer.from(match[2],'base64');const form=new FormData();form.append('messaging_product','whatsapp');form.append('file',new Blob([bytes],{type:match[1]}),'message-image');
    const upload=await fetch(`${base}/media`,{method:'POST',headers,...{body:form}});const ud=await upload.json().catch(()=>({}));if(!upload.ok||!ud.id)throw new Error(ud.error?.message||`WhatsApp image upload failed (${upload.status}).`);
    payload={messaging_product:'whatsapp',recipient_type:'individual',to,type:'image',image:{id:ud.id,caption:row.body}};
  }
  const response=await fetch(`${base}/messages`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.messages?.[0]?.id)throw new Error(data.error?.error_user_msg||data.error?.message||`WhatsApp rejected the message (${response.status}). Check opt-in, approved templates and the 24-hour messaging window.`);
  return data.messages[0].id;
}
async function deliverMessageById(id){
  const row=db.prepare("SELECT * FROM messages WHERE id=? AND status IN ('pending','scheduled')").get(id);if(!row)return {skipped:true};
  const member=row.user_id?db.prepare("SELECT id,name,member_id,plan,phone FROM users WHERE id=? AND role='member' AND archived_at IS NULL").get(row.user_id):null;
  if(row.user_id&&!member){db.prepare("UPDATE messages SET status='cancelled',delivery_status='cancelled',delivery_error='Cancelled because the member account is no longer active.' WHERE id=? AND status IN ('pending','scheduled')").run(id);return {skipped:true};}
  const recipient=member||{name:row.recipient_name,member_id:row.recipient_member_id,plan:'',phone:row.recipient_phone};
  if(!recipient.name||!recipient.phone){db.prepare("UPDATE messages SET status='failed',delivery_status='failed',delivery_error=? WHERE id=?").run('Recipient details are missing or no longer available.',id);return {ok:false};}
  try{const providerId=await sendWhatsAppMessage(row,recipient);db.prepare("UPDATE messages SET status='sent',sent_at=?,delivery_error='',provider_message_id=?,delivery_status='sent' WHERE id=? AND status IN ('pending','scheduled')").run(new Date().toISOString(),providerId,id);return {ok:true};}
  catch(e){const message=String(e.message||'Delivery failed').slice(0,500);db.prepare("UPDATE messages SET status='failed',delivery_status='failed',delivery_error=? WHERE id=? AND status IN ('pending','scheduled')").run(message,id);console.error(`WhatsApp delivery failed for message ${id}: ${message}`);return {ok:false,error:message};}
}
app.post("/api/admin/messages/bulk",admin,async(req,res)=>{
 const requestedRecipients=Array.isArray(req.body.recipients)?req.body.recipients:[],templateId=Number(req.body.template_id)||null,subject=clean(req.body.subject,160),body=clean(req.body.body,3000),image=clean(req.body.image_data,2500000),mode=clean(req.body.delivery_mode,20)||'manual',scheduled=clean(req.body.scheduled_at,80),audienceType=clean(req.body.audience_type,20)||'members',audiencePlan=clean(req.body.audience_plan,30),audienceSearch=clean(req.body.audience_search,120).toLowerCase();
 if(!body||!['manual','automatic','scheduled_selected'].includes(mode))return res.status(400).json({error:'Enter a message before sending.'});
 const isScheduled=mode!=='manual',isFilterSchedule=mode==='automatic';
 if(!['members','active','pending','renewals','enquiries'].includes(audienceType))return res.status(400).json({error:'Choose a valid recipient group.'});
 if(templateId&&!db.prepare('SELECT id FROM message_templates WHERE id=?').get(templateId))return res.status(400).json({error:'Selected message template is no longer available.'});
 if(image&&!/^data:image\/(png|jpe?g|webp);base64,/i.test(image))return res.status(400).json({error:'Please select a PNG, JPG or WebP image.'});
 if(isScheduled&&!scheduled)return res.status(400).json({error:'Choose a future date and time for scheduled delivery.'});
 let recipients=[];
 if(isFilterSchedule){
   if(audienceType==='enquiries'){
     const where=["status='new'","converted_user_id IS NULL"],params=[];
     if(audienceSearch){where.push("lower(name||' '||phone||' '||email||' '||topic||' '||place) LIKE ?");params.push(`%${audienceSearch}%`)}
     recipients=db.prepare(`SELECT id,name,phone,'' AS member_id,'' AS plan,'enquiry' AS type FROM enquiries WHERE ${where.join(' AND ')} ORDER BY id DESC`).all(...params);
   }else{
     const where=["role='member'","archived_at IS NULL"],params=[];
     if(audienceType==='active'||audienceType==='pending'){where.push('status=?');params.push(audienceType)}
     if(audienceType==='renewals')where.push("membership_due_date IS NOT NULL AND date(membership_due_date)<=date('now','+7 day')");
     if(validMembershipPlan(audiencePlan)||audiencePlan==='Custom'){where.push('plan=?');params.push(audiencePlan)}
     if(audienceSearch){where.push("lower(name||' '||member_id||' '||phone||' '||coalesce(email,'')) LIKE ?");params.push(`%${audienceSearch}%`)}
     recipients=db.prepare(`SELECT id,name,phone,member_id,plan,'member' AS type FROM users WHERE ${where.join(' AND ')} ORDER BY id DESC`).all(...params);
   }
 }else{
   const refs=requestedRecipients.map(x=>({type:x?.type,id:Number(x?.id)})).filter(x=>['member','enquiry'].includes(x.type)&&Number.isInteger(x.id)&&x.id>0);
   const uniqueRefs=[...new Map(refs.map(x=>[`${x.type}:${x.id}`,x])).values()];
   const memberIds=uniqueRefs.filter(x=>x.type==='member').map(x=>x.id),enquiryIds=uniqueRefs.filter(x=>x.type==='enquiry').map(x=>x.id);
   if(memberIds.length)recipients.push(...db.prepare(`SELECT id,name,phone,member_id,plan,'member' AS type FROM users WHERE role='member' AND archived_at IS NULL AND id IN (${memberIds.map(()=>'?').join(',')})`).all(...memberIds));
   if(enquiryIds.length)recipients.push(...db.prepare(`SELECT id,name,phone,'' AS member_id,'' AS plan,'enquiry' AS type FROM enquiries WHERE status='new' AND converted_user_id IS NULL AND id IN (${enquiryIds.map(()=>'?').join(',')})`).all(...enquiryIds));
 }
 if(!recipients.length)return res.status(400).json({error:isScheduled?'No recipients match the selected group and filters.':'Select at least one recipient to send this message to.'});
 let scheduledAt=null,status='pending';if(isScheduled){const d=parseScheduledDate(scheduled);if(Number.isNaN(d.getTime())||d.getTime()<=Date.now())return res.status(400).json({error:'Choose a valid future date and time for scheduled delivery.'});scheduledAt=d.toISOString();status='scheduled';}
 const missingPhones=recipients.filter(user=>!whatsappPhone(user.phone));if(missingPhones.length)return res.status(400).json({error:`Add a valid WhatsApp phone number with country code for: ${missingPhones.map(user=>user.name).join(', ')}.`});
 const stmt=db.prepare('INSERT INTO messages(user_id,template_id,subject,body,image_data,recipient_name,recipient_member_id,recipient_phone,delivery_mode,scheduled_at,sent_at,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');const inserted=[],storedMode=isScheduled?'automatic':'manual';
 const tx=db.transaction(()=>{for(const recipient of recipients){const memberId=recipient.member_id||'',finalBody=body.replace(/{{name}}/g,recipient.name).replace(/{{member_id}}/g,memberId).replace(/{{plan}}/g,recipient.plan||'').replace(/{{date}}/g,scheduledAt?new Date(scheduledAt).toLocaleDateString('en-IN'):new Date().toLocaleDateString('en-IN'));const userId=recipient.type==='member'?recipient.id:null;const r=stmt.run(userId,templateId,subject,finalBody,image,recipient.name,memberId,recipient.phone,storedMode,scheduledAt,null,status,req.user.id);inserted.push(Number(r.lastInsertRowid));}});tx();
 if(isScheduled){const audience=isFilterSchedule?`the selected ${audienceType} group`:'selected recipients';return res.status(201).json({count:inserted.length,status:'scheduled',message:`${inserted.length} reminder${inserted.length===1?'':'s'} scheduled for ${audience} at ${new Date(scheduledAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST. Keep the Sibi server and configured WhatsApp gateway running; due messages send automatically when a provider is configured.`})}
 if(!whatsappConfigured()){db.prepare("UPDATE messages SET status='pending',delivery_status='manual_ready',delivery_error='Ready to send manually: open WhatsApp from Delivery history.' WHERE id IN ("+inserted.map(()=>'?').join(',')+")").run(...inserted);return res.status(202).json({count:inserted.length,status:'manual_ready',message:`${inserted.length} message${inserted.length===1?'':'s'} ready. Open WhatsApp from Delivery history and press Send. Automatic sending requires a configured OpenWA or Meta WhatsApp Cloud API sender.`})}
 const results=[];for(const id of inserted)results.push(await deliverMessageById(id));const sent=results.filter(x=>x.ok).length,failed=results.filter(x=>x.ok===false).length;
 return res.status(201).json({count:inserted.length,sent,failed,status:failed?'partial': 'sent',message:failed?`${sent} sent; ${failed} failed. Open delivery history to see the exact error and retry after fixing it.`:`All ${sent} message${sent===1?'':'s'} accepted by WhatsApp.`});
});
app.post('/api/admin/messages/retry',admin,async(req,res)=>{const ids=Array.isArray(req.body.ids)?[...new Set(req.body.ids.map(Number).filter(Number.isInteger))]:[];if(!ids.length)return res.status(400).json({error:'Choose one or more failed or pending messages to retry.'});if(!whatsappConfigured())return res.status(503).json({error:'Automatic WhatsApp delivery is not configured. Configure OpenWA or Meta WhatsApp Cloud API on the server first.'});const results=[];for(const id of ids){db.prepare("UPDATE messages SET status='pending',delivery_error='' WHERE id=? AND status IN ('failed','pending')").run(id);results.push(await deliverMessageById(id));}const sent=results.filter(x=>x.ok).length,failed=results.filter(x=>x.ok===false).length;res.json({sent,failed,message:`Retry finished: ${sent} sent, ${failed} failed.`});
});
app.get("/api/member/messages",auth,(req,res)=>{if(req.user.role!=="member")return res.status(403).json({error:"Member account required."});res.json({messages:db.prepare("SELECT id,subject,body,image_data,sent_at,created_at FROM messages WHERE user_id=? AND status='sent' ORDER BY id DESC LIMIT 100").all(req.user.id)})});

app.post("/api/admin/trainers",admin,(req,res)=>{const name=clean(req.body.name,100),specialty=clean(req.body.specialty,120),bio=clean(req.body.bio,1000),certifications=clean(req.body.certifications,300),photo=clean(req.body.photo_url,500),experience=Number(req.body.experience_years);if(name.length<2)return res.status(400).json({error:"Enter a trainer name with at least 2 characters."});if(specialty.length<2)return res.status(400).json({error:"Enter a specialty with at least 2 characters."});if(bio.length<10)return res.status(400).json({error:"Enter a trainer bio with at least 10 characters."});if(!Number.isInteger(experience)||experience<0||experience>60)return res.status(400).json({error:"Enter a whole number of years from 0 to 60."});const r=db.prepare("INSERT INTO trainers(name,specialty,experience_years,bio,certifications,photo_url) VALUES(?,?,?,?,?,?)").run(name,specialty,experience,bio,certifications,photo);res.status(201).json({trainer:db.prepare("SELECT * FROM trainers WHERE id=?").get(r.lastInsertRowid)})});
app.delete("/api/admin/trainers/:id",admin,(req,res)=>{const r=db.prepare("UPDATE trainers SET active=0 WHERE id=?").run(Number(req.params.id));if(!r.changes)return res.status(404).json({error:"Trainer not found."});res.json({ok:true})});
app.get("/api/admin/enquiries",admin,(req,res)=>res.json({enquiries:db.prepare("SELECT e.*,u.member_id AS converted_member_id FROM enquiries e LEFT JOIN users u ON u.id=e.converted_user_id ORDER BY e.id DESC LIMIT 500").all(),fetched_at:new Date().toISOString()}));
app.patch("/api/admin/enquiries/:id",admin,async(req,res)=>{const id=Number(req.params.id),status=clean(req.body.status,20);if(!["new","contacted","closed"].includes(status))return res.status(400).json({error:"Invalid enquiry status."});const enquiry=db.prepare("SELECT * FROM enquiries WHERE id=?").get(id);if(!enquiry)return res.status(404).json({error:"Enquiry not found."});
if(status!=="closed"){db.prepare("UPDATE enquiries SET status=? WHERE id=?").run(status,id);return res.json({ok:true,status,message:"Enquiry status saved."});}
try{
  let userId=enquiry.converted_user_id||null,temporaryPassword="";
  if(!userId){
    const normalizedEmail=(enquiry.email||"").trim().toLowerCase();
    const existing=normalizedEmail?db.prepare("SELECT id FROM users WHERE role='member' AND lower(email)=? AND email NOT LIKE '%@member.local'").get(normalizedEmail):db.prepare("SELECT id FROM users WHERE role='member' AND phone=? ORDER BY id LIMIT 1").get(enquiry.phone);
    if(existing) userId=existing.id;
    else {
      const memberId=makeMemberId(); temporaryPassword=`Sibi@${Math.random().toString(36).slice(2,8).toUpperCase()}!`; const hash=await bcrypt.hash(temporaryPassword,12); const email=normalizeEmail(normalizedEmail,memberId); const r=db.prepare("INSERT INTO users(member_id,name,email,phone,address,password_hash,role,plan,status) VALUES(?,?,?,?,?,?,'member','Basic','pending')").run(memberId,enquiry.name,email,enquiry.phone,enquiry.place,hash); userId=Number(r.lastInsertRowid);
    }
  }
  db.prepare("UPDATE enquiries SET status='closed',converted_user_id=? WHERE id=?").run(userId,id); const member=db.prepare(`${memberSelect} AND u.id=?`).get(userId); res.json({ok:true,status:"closed",converted:true,member,temporaryPassword,message:temporaryPassword?"Enquiry closed and new member created successfully.":"Enquiry closed and linked to the existing member."});
}catch(e){console.error(e);res.status(500).json({error:"Could not close the enquiry and create the member."})}});
app.use(express.static(path.join(ROOT,"public"),{setHeaders:(res)=>{res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate");res.setHeader("Pragma","no-cache");res.setHeader("Expires","0")}}));app.get("/",(req,res)=>res.sendFile(path.join(ROOT,"public","index.html")));
let schedulerBusy=false;
async function deliverScheduledMessages(){
  if(schedulerBusy)return;schedulerBusy=true;
  try{
    const due=db.prepare("SELECT id FROM messages WHERE status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at<=? ORDER BY scheduled_at,id LIMIT 50").all(new Date().toISOString());
    if(whatsappConfigured()){
      for(const row of due)await deliverMessageById(row.id);
    }else if(due.length){
      const result=db.prepare("UPDATE messages SET status='pending',delivery_status='manual_ready',delivery_error='Ready to send manually: open WhatsApp from Delivery history.' WHERE id IN ("+due.map(()=>'?').join(',')+") AND status='scheduled'").run(...due.map(row=>row.id));
      if(result.changes)console.log(`${result.changes} scheduled reminder(s) ready for manual WhatsApp sending because no automatic sender is configured.`);
    }
  }
  catch(e){console.error('Scheduled WhatsApp delivery worker error:',e)}finally{schedulerBusy=false}
}
setInterval(deliverScheduledMessages,SCHEDULE_POLL_INTERVAL_MS);deliverScheduledMessages();

(async()=>{try{await seedAdmin();app.listen(PORT,()=>console.log(`Sibi Sports Club running at http://localhost:${PORT}`));}catch(e){console.error("Startup failed:",e);process.exit(1)}})();
