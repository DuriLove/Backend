// Explicit source allowlist: never package .env, DBs, backups, Git or Frontend.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');const output=process.argv[2];
if(!output||fs.existsSync(output)){console.error('Supply a NEW .tar.gz output path');process.exit(1);}
const stage=fs.mkdtempSync(path.join(os.tmpdir(),'duri-release-'));
try{const allowed=['src','scripts','test','docs','deploy','Dockerfile','.dockerignore','.env.example','.nvmrc','.gitignore','README.md','package.json','package-lock.json','nest-cli.json','tsconfig.json','tsconfig.build.json'];
const hashes={};function copy(relative){const source=path.resolve(relative),dest=path.join(stage,relative),stat=fs.lstatSync(source);if(stat.isSymbolicLink())throw Error('SYMLINK_NOT_ALLOWED');if(stat.isDirectory()){fs.mkdirSync(dest,{recursive:true});for(const name of fs.readdirSync(source)){if(name.startsWith('.env'))continue;copy(path.join(relative,name));}}else{fs.mkdirSync(path.dirname(dest),{recursive:true});const bytes=fs.readFileSync(source);fs.writeFileSync(dest,bytes);hashes[relative]=crypto.createHash('sha256').update(bytes).digest('hex');}}
for(const entry of allowed)copy(entry);fs.writeFileSync(path.join(stage,'release-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),files:hashes},null,2));
const result=spawnSync('tar',['-czf',path.resolve(output),'-C',stage,'.'],{stdio:'ignore'});if(result.status!==0)throw Error('ARCHIVE_FAILED');fs.chmodSync(output,0o600);console.log(JSON.stringify({fileCount:Object.keys(hashes).length,sha256:crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex')}));
}finally{fs.rmSync(stage,{recursive:true,force:true});}
