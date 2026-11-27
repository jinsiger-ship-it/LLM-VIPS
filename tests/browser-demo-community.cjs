const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path');

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE});
  try {
    for(const width of [320,390,768]){
      const base='http://fanplay.test/', records=new Map(), posts=[];
      const errors=[];
      let resumeAvailable=true;
      async function pageForBrowser(){
        const page=await browser.newPage({viewport:{width,height:740},reducedMotion:'reduce'});
        page.on('pageerror',error=>errors.push(error.message));
        await page.route(base+'**',route=>{
          const file=new URL(route.request().url()).pathname.slice(1)||'index.html';
          if(!/^(index\.html|(?:js|css)\/[a-z-]+\.(?:js|css)|js\/vendor\/supabase\.js)$/.test(file))return route.abort();
          return route.fulfill({path:path.resolve(__dirname,'..',file)});
        });
        await page.route('https://*.supabase.co/rest/v1/rpc/*',async route=>{
          const name=new URL(route.request().url()).pathname.split('/').at(-1);
          const args=route.request().postDataJSON();
          const ok=json=>route.fulfill({json});
          const record=records.get(args.p_player_id);
          const identity=args.p_browser_key?args.p_player_id+':'+args.p_browser_key:null;
          switch(name){
            case 'fanplay_demo_ticket_feed_v2':
            case 'fanplay_demo_ticket_write_v2':
              return route.fulfill({status:404,json:{code:'PGRST202'}});
            case 'fanplay_demo_status': return ok({ready:true,version:1});
            case 'fanplay_demo_resume':
              return resumeAvailable?ok(record||null):route.fulfill({status:404,json:{code:'PGRST202'}});
            case 'fanplay_demo_join':
              if(record)return route.fulfill({status:409,json:{code:'PT409',message:'이미 가입한 아이디예요.'}});
              records.set(args.p_player_id,{username:args.p_player_id,state:{profile:{team:args.p_team}},revision:0});
              return ok(records.get(args.p_player_id));
            case 'fanplay_demo_save':
              if(record.revision!==args.p_revision)return route.fulfill({status:409,json:{message:'기록 충돌'}});
              Object.assign(record,{state:args.p_state,revision:record.revision+1});
              return ok(record);
            case 'fanplay_demo_ticket_feed': {
              const rows=posts.map(({owner,likers,comments,...rest})=>({...rest,mine:identity===owner,
                liked:likers.has(identity),likes:likers.size,replyCount:comments.length,
                comments:comments.map(({author,...comment})=>({...comment,mine:author===identity}))}));
              const metric={likes:'likes',comments:'replyCount'}[args.p_sort];
              return ok(metric?rows.filter(p=>p[metric]>0).sort((a,b)=>b[metric]-a[metric]).slice(0,10):rows);
            }
            case 'fanplay_demo_ticket_write': {
              assert.match(args.p_browser_key,/^[a-f0-9]{64}$/);
              const found=posts.find(p=>p.id===args.p_post_id);
              if(args.p_action==='post'){
                posts.unshift({id:'post-'+(posts.length+1),owner:identity,nickname:'테스트 팬',ticket:args.p_ticket,
                  text:args.p_text,createdAt:'2026-11-24T12:00:00Z',likers:new Set(),comments:[]});
                record.revision++;
              }
              if(args.p_action==='edit'){assert.equal(found.owner,identity);found.text=args.p_text;record.revision++;}
              if(args.p_action==='like'){if(args.p_liked)found.likers.add(identity);else found.likers.delete(identity);}
              if(args.p_action==='comment')found.comments.push({id:'c1',author:identity,nickname:'시연팬',text:args.p_text});
              if(args.p_action==='remove-comment'){
                const index=found.comments.findIndex(c=>c.id===args.p_comment_id&&c.author===identity);
                assert(index>=0);found.comments.splice(index,1);
              }
              return ok(found?.id||'post-1');
            }
            default: throw Error('unexpected RPC '+name);
          }
        });
        await page.addInitScript(()=>{
          window.supabase={createClient(){return {
            channel(){return {on(...args){window.refreshSignal=args.at(-1);return this;},subscribe(){return this;}};},
            removeChannel:async()=>{}
          };}};
        });
        return page;
      }
      async function enter(page,id,team){
        const form=page.locator('form[data-account-action="login"]');
        await form.waitFor();
        assert.equal(await page.locator('input[type="email"], input[type="password"]').count(),0);
        await page.locator('.bottomnav').waitFor({state:'hidden'});
        await form.locator('[name="username"]').fill(id);
        assert.equal(await form.locator('[name="team"]').count(),0);
        await form.locator('button[type="submit"]').click();
        if(team){
          await page.locator('#login-error',{hasText:'가입한 아이디를 찾지 못했어요.'}).waitFor();
          assert.equal(records.has(id),false);
          await page.getByRole('link',{name:'회원가입',exact:true}).click();
          const form=page.locator('form[data-account-action="register"]');
          assert.equal(await form.locator('[name="username"]').inputValue(),id);
          assert.equal(await page.locator('input[type="email"], input[type="password"]').count(),0);
          const choice=form.locator(`[name="team"][value="${team}"]`);
          await choice.focus();
          await choice.press('Space');
          assert(await choice.isChecked());
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
          await form.locator('button[type="submit"]').click();
        }
        await page.waitForFunction(expected=>FP.account.username===expected&&!FP.account.busy,id);
        assert.equal(await page.locator('.login-teams').count(),0);
      }
      const a=await pageForBrowser();
      await a.goto(base+'#community');
      await a.getByText('아직 이 목록에 티켓이 없어요.').waitFor();
      assert(await a.locator('.header-account').isHidden());
      assert.equal(await a.locator('.bottomnav a').count(),4);
      assert.equal(await a.locator('.bottomnav a[href="#collection"]').count(),0);
      await a.locator('.bottomnav a[href="#profile"]').click();
      await a.getByText('이번 방문의 티켓',{exact:true}).waitFor();
      assert.equal(await a.locator('.account-panel').count(),0);
      await a.locator('.my-collection-link').click();
      await a.getByRole('link',{name:'첫 티켓 만들기'}).waitFor();
      await a.evaluate(()=>FP.transact(d=>{d.tickets.push({...FP.sample,id:'sample'});}));
      await a.goto(base+'#profile');
      await a.locator('.my-collection-link').click();
      await a.locator('[data-action="share"]').click();
      await a.getByRole('link',{name:'비회원으로 계속'}).click();
      await a.locator('[data-action="share"]').click();
      await enter(a,'demo_a','LG');
      await a.getByRole('heading',{name:'선택한 티켓 게시하기'}).waitFor();
      assert.equal(await a.evaluate(()=>FP.data.tickets.length),0);
      assert.equal(await a.locator('.bottomnav a[aria-current="page"]').getAttribute('href'),'#profile');
      await a.locator('[data-action="resume-share"]').click();
      await a.locator('#public-share-form').waitFor();
      assert.equal(await a.locator('#public-share-form [name="includeNote"]').isChecked(),false);
      await a.locator('#public-share-form [name="message"]').fill('시연 티켓');
      await a.locator('#public-share-form button[type="submit"]').click();
      await a.getByText('시연 티켓',{exact:true}).waitFor();
      assert.equal(await a.getByText('아홉 번의 이닝, 오래 남을 한순간.',{exact:true}).count(),0);
      assert.equal(await a.locator('[data-action="edit-post"]').count(),1);
      await a.locator('.bottomnav a[href="#profile"]').click();
      await a.locator('.profile-card').getByText('LG 트윈스',{exact:false}).waitFor();
      const headerAccount=a.locator('.header-account');
      const background=link=>link.evaluate(node=>getComputedStyle(node).backgroundColor);
      const beforeTeam=await background(headerAccount);
      await a.getByRole('link',{name:'회원정보 수정'}).click();
      await a.locator('#profile-form [name="team"]').selectOption('한화');
      await a.locator('#profile-form button[type="submit"]').click();
      await a.locator('.profile-card').getByText('한화 이글스',{exact:false}).waitFor();
      const afterTeam=await background(headerAccount);
      assert.notEqual(afterTeam,beforeTeam);
      const b=await pageForBrowser();
      await b.goto(base+'#community');
      await b.getByRole('link',{name:'로그인하고 참여하기 →'}).click();
      await enter(b,'demo_a');
      await b.getByText('시연 티켓',{exact:true}).waitFor();
      assert.equal(await b.locator('[data-action="edit-post"], [data-action="delete-post"]').count(),0);
      await b.locator('[data-action="like"]').click();
      await b.getByRole('button',{name:'♥ 좋아요 1'}).waitFor();
      await b.locator('.community-comments summary').click();
      await b.locator('.comment-form input').fill('좋은 경기네요');
      await b.locator('.comment-form button').click();
      await b.getByText('좋은 경기네요',{exact:false}).waitFor();
      for(const sort of ['likes','comments']){
        await b.locator('[data-action="community-sort"][data-value="'+sort+'"]').click();
        await b.getByText('1위',{exact:true}).waitFor();
      }
      if(!await b.locator('.community-comments').evaluate(details=>details.open))await b.locator('.community-comments summary').click();
      b.once('dialog',d=>d.accept());
      await b.getByRole('button',{name:'내 댓글 삭제'}).click();
      await b.getByText('아직 이 목록에 티켓이 없어요.').waitFor();
      await a.locator('.bottomnav a[href="#community"]').click();
      await a.waitForURL('**/#community');
      await a.reload();
      await a.getByText('시연 티켓',{exact:true}).waitFor();
      await a.locator('[data-action="edit-post"]').waitFor();
      assert(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      assert(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await b.locator('.bottomnav a[href="#profile"]').click();
      await b.locator('.profile-card').getByText('한화 이글스',{exact:false}).waitFor();
      assert.equal(await b.locator('#app a[href="#account"]').count(),0);
      await b.locator('.bottomnav a[href="#community"]').click();
      const account=b.locator('header').getByRole('link',{name:'계정 및 기록 관리'});
      assert.equal(await background(account),afterTeam);
      assert(await account.evaluate(link=>{
        const button=link.getBoundingClientRect();
        const season=link.previousElementSibling.getBoundingClientRect();
        const brand=link.closest('header').querySelector('.brand').getBoundingClientRect();
        return button.height>=44&&brand.right<=season.left&&season.right<=button.left&&button.right<=innerWidth;
      }));
      await b.locator('header .brand').focus();
      await b.keyboard.press('Tab');
      assert(await account.evaluate(link=>link.matches(':focus-visible')&&getComputedStyle(link).outlineStyle==='solid'));
      await account.click();
      await b.getByRole('heading',{name:'계정 및 기록 관리'}).waitFor();
      assert.equal(await account.getAttribute('aria-current'),'page');
      assert.notEqual(await background(account),afterTeam);
      await b.getByRole('button',{name:'로그아웃'}).click();
      await b.locator('.header-account').waitFor({state:'hidden'});
      await b.getByRole('link',{name:'로그인',exact:true}).click();
      resumeAvailable=false;
      const login=b.locator('form[data-account-action="login"]');
      await login.locator('[name="username"]').fill('demo_a');
      await login.locator('button[type="submit"]').click();
      await b.locator('#login-error',{hasText:'온라인 저장소 설정이 아직 완료되지 않았어요.'}).waitFor();
      assert.equal(await b.locator('.login-teams').count(),0);
      resumeAvailable=true;
      await b.getByRole('link',{name:'회원가입',exact:true}).click();
      const signup=b.locator('form[data-account-action="register"]');
      await signup.locator('[name="team"][value="KT"] + span').click();
      await signup.locator('button[type="submit"]').click();
      await b.locator('#login-error',{hasText:'이미 가입한 아이디예요.'}).waitFor();
      assert.equal(records.size,1);
      assert.equal(records.get('demo_a').state.profile.team,'한화');
      await b.getByRole('link',{name:'로그인',exact:true}).click();
      await enter(b,'demo_a');
      await b.locator('.profile-card').getByText('한화 이글스',{exact:false}).waitFor();
      assert.deepEqual(errors,[]);
      console.log('PASS '+width+'px: explicit signup, existing login, duplicate ID, unavailable lookup, guest return and community');
      await a.close();await b.close();
    }
  } finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
