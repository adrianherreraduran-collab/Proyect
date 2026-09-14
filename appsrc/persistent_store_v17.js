// FVM_PERSISTENCE_V17
const fs=require('fs');
let Pool=null;try{({Pool}=require('pg'))}catch{}
let pool=null,dataFile='',enabled=false,lastError='',timer=null,pending=null;

function dbUrl(){return String(process.env.DATABASE_URL||process.env.POSTGRES_URL||process.env.RENDER_POSTGRES_URL||'').trim()}
function config(file){dataFile=file}
async function init(){
  const url=dbUrl();
  if(!url||!Pool){
    enabled=false;lastError=url?'Módulo pg no disponible':'DATABASE_URL no configurada';
    console.log('FVMarket persistence: file fallback · '+lastError);
    return {enabled:false,mode:'file',reason:lastError};
  }
  try{
    pool=new Pool({connectionString:url,ssl:{rejectUnauthorized:false},max:3,idleTimeoutMillis:15000,connectionTimeoutMillis:12000});
    await pool.query(`CREATE TABLE IF NOT EXISTS fvmarket_state (state_key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const q=await pool.query(`SELECT payload FROM fvmarket_state WHERE state_key='main' LIMIT 1`);
    if(q.rows.length){
      const raw=String(q.rows[0].payload||'');JSON.parse(raw);fs.writeFileSync(dataFile,raw);console.log('FVMarket persistence: restored state from Postgres');
    }else if(fs.existsSync(dataFile)){
      const raw=fs.readFileSync(dataFile,'utf8');JSON.parse(raw);await pool.query(`INSERT INTO fvmarket_state(state_key,payload,updated_at) VALUES('main',$1,NOW()) ON CONFLICT(state_key) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,[raw]);console.log('FVMarket persistence: initial state copied to Postgres');
    }
    enabled=true;lastError='';console.log('FVMarket persistence: Postgres enabled');return {enabled:true,mode:'postgres'};
  }catch(e){enabled=false;lastError=String(e.message||e);console.error('FVMarket persistence: Postgres unavailable · '+lastError);try{await pool?.end()}catch{}pool=null;return {enabled:false,mode:'file',reason:lastError}}
}
async function flush(){
  timer=null;if(!enabled||!pool||pending==null)return;const raw=pending;pending=null;
  try{await pool.query(`INSERT INTO fvmarket_state(state_key,payload,updated_at) VALUES('main',$1,NOW()) ON CONFLICT(state_key) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()`,[raw]);lastError=''}catch(e){lastError=String(e.message||e);console.error('FVMarket persistence write failed:',lastError)}
  if(pending!=null)scheduleRaw(pending);
}
function scheduleRaw(raw){pending=raw;if(timer)clearTimeout(timer);timer=setTimeout(flush,180)}
function persist(data){if(!enabled)return;try{scheduleRaw(JSON.stringify(data,null,2))}catch(e){lastError=String(e.message||e)}}
function status(){return {enabled,mode:enabled?'postgres':'file',dataFile,lastError}}
module.exports={config,init,persist,status};
