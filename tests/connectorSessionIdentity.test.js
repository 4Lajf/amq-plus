import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const source=readFileSync(new URL('../amqPlusConnector.user.js',import.meta.url),'utf8');
it('stores the server quiz UUID instead of the input play token for training actions',()=>{
 const section=source.slice(source.indexOf('function applyReadySession(data)'));
 const assignment=section.match(/trainingState\.currentSession = (\{[\s\S]*?\n    \});/)[1];
 const data={sessionId:'session',quizId:'eb90a823-11a7-4c58-8b50-c62f5438a914',quizName:'Test',playlist:[]};
 const session=Function('data','quizId',`return (${assignment});`)(data,'different-play-token');
 expect(session.quizId).toBe(data.quizId);expect(session.sessionId).toBe('session');
});
