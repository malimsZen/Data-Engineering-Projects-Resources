(window.__LOADABLE_LOADED_CHUNKS__=window.__LOADABLE_LOADED_CHUNKS__||[]).push([[7],{OLAl:function(t,e,n){"use strict";n.d(e,"c",(function(){return s})),n.d(e,"d",(function(){return a})),n.d(e,"f",(function(){return l})),n.d(e,"i",(function(){return r})),n.d(e,"h",(function(){return u})),n.d(e,"g",(function(){return b})),n.d(e,"e",(function(){return d})),n.d(e,"b",(function(){return f})),n.d(e,"a",(function(){return p}));var o=n("YyUk"),c=n("mwIZ"),i=n.n(c);function s(){return i()(window,"globalHeader.actionBar")}function a(t,e,n,o,c){const{formatMessage:i}=t,a=[{title:i({id:"COMMON_MY_PROJECTS"}),url:"/projects?context=".concat(e)}];n&&o&&(a.push({title:o,url:"/projects/".concat(n,"?context=").concat(e)}),c&&a.push({title:c}));const l=s();l&&"object"==typeof l&&(l.setVisible(!0),l.setBreadcrumbs(a))}function l(){!function(){const t=s();t&&"object"==typeof t&&t.setVisible(!1)}()}function r(t,e,n){const o=s();o&&"object"==typeof o&&(o.setVisible(!0),o.setBreadcrumbs([{title:n}]))}function u(t){let{intl:e,context:n,scope:c=o.h,scopeId:i,scopeName:s,title:a}=t;b({intl:e,context:n,scope:c,scopeId:i,scopeName:s,notebookName:a})}function b(t){let{intl:e,context:n,scope:c=o.h,scopeId:i,scopeName:a,notebookName:l}=t;const{formatMessage:r}=e,u=s(),b=c===o.h?"/projects":"/ml-runtime/spaces",d="".concat(b,"?context=").concat(n),f="".concat(b,"/").concat(i,"?context=").concat(n);u&&"object"==typeof u&&(u.setVisible(!0),u.setBreadcrumbs([{title:c===o.h?r({id:"COMMON_MY_PROJECTS"}):r({id:"COMMON_MY_DEPLOYMENTS"}),url:d},{title:a,url:f},{title:l}]))}function d(t){let{intl:e,context:n,scope:c=o.h,scopeId:i,scopeName:a,jobId:l,jobName:r,runId:u}=t;const{formatMessage:b}=e,d=s(),f=c===o.h?"/projects":"/ml-runtime/spaces",p="".concat(f,"?context=").concat(n),_="".concat(f,"/").concat(i,"?context=").concat(n),O="/jobs/".concat(l,"?").concat(c,"_id=").concat(i,"&context=").concat(n),m="/analytics/notebooks/jobs/runs?job_id=".concat(l,"&jobrun_id=").concat(u,"&").concat(c,"_id=").concat(i,"&context=").concat(n);d&&"object"==typeof d&&a&&r&&(d.setVisible(!0),d.setBreadcrumbs([{title:c===o.h?b({id:"COMMON_MY_PROJECTS"}):b({id:"COMMON_MY_DEPLOYMENTS"}),url:p},{title:a,url:_},{title:r,url:O},{title:b({id:"NOTEBOOK_JOB_RUN_DETAILS_TITLE"}),url:m},{title:b({id:"NOTEBOOK_JOB_RUN_OUTPUT_TITLE"})}]))}function f(){const t=s();t&&"object"==typeof t&&(t.update({rhs:{info:{enabled:!1},versions:{enabled:!1},comments:{enabled:!1},history:{enabled:!1},maker:{enabled:!1}}}),t.setRHSVisible(!1))}function p(){const t=s();t&&"object"==typeof t&&(t.update({actions:{share:{visible:!1},schedule:{visible:!1},more:{visible:!1},projectcontext:{visible:!1},github:{visible:!1},"publish-gist":{visible:!1},"publish-github":{visible:!1},"publish-function":{visible:!1}},rhs:{info:{enabled:!1},versions:{enabled:!1},comments:{enabled:!1},history:{enabled:!1},maker:{enabled:!1}}}),t.setRHSVisible(!1))}}}]);