// node --env-file=.env scripts/verify-like-baseline.mjs --run
// Disposable private quiz: verify the connected database keeps historical likes.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
if(!process.argv.includes('--run')) throw new Error('Pass --run to create a disposable fixture.');
const db=createClient(process.env.PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false}});
const quizId=randomUUID(),owner='25b56784-dd1a-4d95-9455-e12fc710cfdf';
const check=r=>{if(r.error)throw new Error(JSON.stringify(r.error));return r.data;};
let created=false;
try{
 const source=check(await db.from('quiz_configurations').select('configuration_data').eq('id','58ea2809-dbcd-4724-aea5-a31d96463330').single());
 check(await db.from('quiz_configurations').insert({id:quizId,user_id:owner,name:'[TEST] like baseline verification',creator_username:'4Lajf',configuration_data:source.configuration_data,is_public:false,play_token:randomBytes(16).toString('base64url'),share_token:randomBytes(16).toString('base64url')}));created=true;
 check(await db.from('quiz_stats').upsert({quiz_id:quizId,legacy_likes:7,likes:7,plays:11},{onConflict:'quiz_id'}));
 for(const liked of [true,false,true,false]){
  const results=await Promise.all(Array.from({length:5},()=>liked?db.from('quiz_likes').upsert({user_id:owner,quiz_id:quizId},{onConflict:'user_id,quiz_id',ignoreDuplicates:true}):db.from('quiz_likes').delete().eq('user_id',owner).eq('quiz_id',quizId)));results.forEach(check);
  const stats=check(await db.from('quiz_stats').select('likes,legacy_likes,plays').eq('quiz_id',quizId).single());
  const rows=check(await db.from('quiz_likes').select('user_id').eq('quiz_id',quizId));
  assert.equal(rows.length,liked?1:0);assert.equal(stats.likes,liked?8:7);assert.equal(stats.legacy_likes,7);assert.equal(stats.plays,11);
  console.log({liked,duplicateRequests:5,...stats,rows:rows.length});
 }
}finally{
 if(created){check(await db.from('quiz_configurations').delete().eq('id',quizId).eq('user_id',owner));assert.equal(check(await db.from('quiz_configurations').select('id').eq('id',quizId)).length,0);assert.equal(check(await db.from('quiz_likes').select('quiz_id').eq('quiz_id',quizId)).length,0);assert.equal(check(await db.from('quiz_stats').select('quiz_id').eq('quiz_id',quizId)).length,0);console.log('Fixture and related rows cleaned up.');}
}
