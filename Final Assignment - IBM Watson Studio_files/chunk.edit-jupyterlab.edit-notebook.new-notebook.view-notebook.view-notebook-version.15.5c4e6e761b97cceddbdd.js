(window.__LOADABLE_LOADED_CHUNKS__=window.__LOADABLE_LOADED_CHUNKS__||[]).push([[15],{IfIl:function(t,i,n){"use strict";n.d(i,"a",(function(){return u})),n.d(i,"b",(function(){return c}));var r=n("mwIZ"),a=n.n(r),e=n("ijCd"),s=n.n(e);function u(t,i){let n=[];if(Array.isArray(t)){const r=t.map(t=>a()(t,"entity.iam_id")),e=t.map(t=>a()(t,"metadata.iui"));Array.isArray(i)&&i.forEach(t=>{let i=!1;const u=a()(t,"entity.iam_id","-"),c=a()(t,"metadata.iui","-");u&&!s()(r,u)&&(r.push(u),i=!0),c&&!s()(e,c)&&(e.push(c),i=!0),i&&n.push(t)})}else Array.isArray(i)&&(n=i);return n}function c(t,i,n){let r=[],e=[];const u=t.map(t=>a()(t,"entity.iam_id")),c=t.map(t=>a()(t,"metadata.iui"));Array.isArray(i)&&(r=i.filter(t=>!s()(c,t))),Array.isArray(n)&&(e=n.filter(t=>!s()(u,t)));let o=null;return(r.length>0||e.length>0)&&(o={iui_ids:r,iam_ids:e}),o}},"P+w5":function(t,i,n){"use strict";n.d(i,"a",(function(){return o}));var r=n("Z781"),a=n("NIJN"),e=n.n(a),s=n("mwIZ"),u=n.n(s),c=n("IfIl");function o(){let t=arguments.length>0&&void 0!==arguments[0]?arguments[0]:[],i=arguments.length>1?arguments[1]:void 0,n=t;switch(i.type){case r.a:const a=JSON.parse(JSON.stringify(t));n=e()(a,Object(c.a)(t,i.accounts)),n.sort((function(t,i){const n=u()(t,"entity.display_name",""),r=u()(i,"entity.display_name","");return n.localeCompare(r)}))}return n}}}]);