(window.__LOADABLE_LOADED_CHUNKS__=window.__LOADABLE_LOADED_CHUNKS__||[]).push([[20],{"9Zjd":function(e,t,n){"use strict";n.d(t,"a",(function(){return u}));var r=n("Z781"),a=n("mwIZ"),o=n.n(a),s=n("JZM8"),i=n.n(s),c=n("D1y2"),d=n.n(c);function u(){let e=arguments.length>0&&void 0!==arguments[0]?arguments[0]:{loaded:!1,resource:null},t=arguments.length>1?arguments[1]:void 0,n=e;switch(t.type){case r.y:o()(e,"resource.metadata.asset_id")===t.notebookId&&(n=JSON.parse(JSON.stringify(e)),d()(n,"resource.entity.notebook.kernel",t.kernel));break;case r.q:if(o()(e,"resource.metadata.asset_id")===t.notebookId){const r=i()(o()(t,"patch",{}),["name","description"]);Object.keys(r).length>0&&(n=JSON.parse(JSON.stringify(e)),d()(n,"resource.metadata",Object.assign(o()(n,"resource.metadata"),r)))}}return n}}}]);