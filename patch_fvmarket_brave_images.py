from pathlib import Path

server = Path('appsrc/server.js')
s = server.read_text()

# Brave Search API credential (stored only in Render environment).
if "const BRAVE_SEARCH_API_KEY" not in s:
    anchor = "const GOOGLE_CSE_CX = String(process.env.GOOGLE_CSE_CX || '');"
    if anchor in s:
        s = s.replace(anchor, anchor + "\nconst BRAVE_SEARCH_API_KEY = String(process.env.BRAVE_SEARCH_API_KEY || '');")
    else:
        anchor = "const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-5.6-luna');"
        s = s.replace(anchor, anchor + "\nconst BRAVE_SEARCH_API_KEY = String(process.env.BRAVE_SEARCH_API_KEY || '');")

# Replace the now-unusable Google Programmable Search image provider with Brave Image Search.
start_marker = "async function searchGoogleImages(query='',limit=8){"
end_marker = "\n}\nasync function searchExternalImages(query='',limit=8){"
if start_marker in s:
    start = s.index(start_marker)
    end = s.index(end_marker, start) + 2
    brave_fn = r'''async function searchBraveImages(query='',limit=8){
  if(!BRAVE_SEARCH_API_KEY)return [];
  try{
    const count=Math.min(Math.max(Number(limit)||8,1),100);
    const r=await axios.get('https://api.search.brave.com/res/v1/images/search',{
      timeout:12000,
      headers:{'Accept':'application/json','Accept-Encoding':'gzip','X-Subscription-Token':BRAVE_SEARCH_API_KEY},
      params:{q:String(query).slice(0,180),count,safesearch:'strict',search_lang:'es',country:'ALL'}
    });
    const rows=r.data?.results||[];
    return rows.map(x=>({
      title:x.title||'',
      url:x.properties?.url||x.thumbnail?.src||'',
      original:x.properties?.url||x.thumbnail?.src||'',
      source:x.url||x.source||'',
      license:'Comprobar derechos/licencia antes de publicar',
      author:'',
      origin:'brave'
    })).filter(x=>x.url&&!isSpanishImageDomain(x.url)&&!isSpanishImageDomain(x.source));
  }catch(e){
    console.warn('Brave image search failed:',e.response?.status||e.message);
    return [];
  }
}'''
    s = s[:start] + brave_fn + s[end:]

s = s.replace("add(await searchGoogleImages(query,Math.min(target+4,10)));", "add(await searchBraveImages(query,Math.min(target+6,20)));")

old_status = "app.get('/api/admin/ai-status',admin,(req,res)=>res.json({openai:!!OPENAI_API_KEY,model:OPENAI_MODEL,googleImages:!!(GOOGLE_CSE_API_KEY&&GOOGLE_CSE_CX),imageSearch:(GOOGLE_CSE_API_KEY&&GOOGLE_CSE_CX?'Google Images + Openverse + Wikimedia':'Openverse + Wikimedia (Google pendiente de credenciales)')+' · excluye dominios de España'}));"
new_status = "app.get('/api/admin/ai-status',admin,(req,res)=>res.json({openai:!!OPENAI_API_KEY,model:OPENAI_MODEL,braveImages:!!BRAVE_SEARCH_API_KEY,imageSearch:(BRAVE_SEARCH_API_KEY?'Brave Images + Openverse + Wikimedia':'Openverse + Wikimedia (Brave pendiente de credencial)')+' · excluye dominios de España'}));"
if old_status in s:
    s = s.replace(old_status,new_status)
else:
    s = s.replace("googleImages:!!(GOOGLE_CSE_API_KEY&&GOOGLE_CSE_CX)", "braveImages:!!BRAVE_SEARCH_API_KEY")
    s = s.replace("(GOOGLE_CSE_API_KEY&&GOOGLE_CSE_CX?'Google Images + Openverse + Wikimedia':'Openverse + Wikimedia (Google pendiente de credenciales)')", "(BRAVE_SEARCH_API_KEY?'Brave Images + Openverse + Wikimedia':'Openverse + Wikimedia (Brave pendiente de credencial)')")

# Update marker/comment so future maintenance reflects the active provider.
s = s.replace('// FVM_PROVIDER_GOOGLE_IMAGES_V2','// FVM_PROVIDER_BRAVE_IMAGES_V3')

server.write_text(s)
print('FVMarket Brave image search patch applied')
