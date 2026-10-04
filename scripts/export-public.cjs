const fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
async function main(){
  const context={window:{}};vm.runInNewContext(await fs.readFile(path.join(root,'site-config.js'),'utf8'),context);
  const config=context.window.LIME_CONFIG;
  if(!config.supabaseKey.startsWith('sb_publishable_'))throw Error('Public publishable key required');
  async function rows(table,columns,publicOnly=true){
    const all=[];
    for(let offset=0;;offset+=100){
      const url=new URL(`${config.supabaseUrl}/rest/v1/${table}`);
      for(const [k,v] of Object.entries({select:columns,order:publicOnly?'id.asc':'key.asc',limit:'100',offset:String(offset)}))url.searchParams.set(k,v);
      if(publicOnly){url.searchParams.set('published','eq.true');url.searchParams.set('deleted_at','is.null');}
      let page;
      if(process.platform==='win32'){
        const {execFileSync}=require('node:child_process');
        page=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-File',path.join(__dirname,'read-public.ps1'),'-Url',url.href,'-PublicKey',config.supabaseKey],{encoding:'utf8',maxBuffer:30*1024*1024,windowsHide:true}));
      }else{
        const response=await fetch(url,{headers:{apikey:config.supabaseKey},signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw Error(`${table}: HTTP ${response.status}`);
        page=await response.json();
      }
      if(!Array.isArray(page)||publicOnly&&page.some(p=>p.published!==true||p.deleted_at!==null))throw Error('Invalid public export');
      all.push(...page);if(page.length<100)break;
    }return all;
  }
  const common='id,title,body,image_data,category,published,created_at,updated_at,deleted_at';
  const journals=await rows('journal_posts',common),blogs=await rows('blog_posts',common+',excerpt,tags'),text=await rows('site_text','key,value',false);
  const output='window.LIME_PUBLIC_SNAPSHOT = '+JSON.stringify({exportedAt:new Date().toISOString(),journals,blogs,text}).replace(/</g,'\\u003c')+';\n';
  await fs.writeFile(path.join(root,'public-snapshot.js.tmp'),output);
  await fs.rename(path.join(root,'public-snapshot.js.tmp'),path.join(root,'public-snapshot.js'));
  console.log(`Exported ${journals.length} public journals, ${blogs.length} public blogs, ${text.length} text fields (${Buffer.byteLength(output)} bytes).`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
