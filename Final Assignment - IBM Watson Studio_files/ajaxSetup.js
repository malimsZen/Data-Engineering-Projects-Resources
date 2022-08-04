files_api_enabled = false;

var getUrlParameter = function (param, default_value){
    var query = window.location.search.substring(1);
    var params = query.split("&");
    for (var i=0;i<params.length;i++) {
           var parameter = params[i].split("=");
           if(parameter[0] == param){return parameter[1];}
    }
    return(default_value);
};

function addDefaultHeaders() {
    var headers = {'X-Requested-With': 'XMLHttpRequest'};
    var projectid = getUrlParameter("project", "");
    var spaceid = getUrlParameter("space", "");
    var serviceid = getUrlParameter("service", "");
    var api_version = getUrlParameter("api", "");
    var storage_type = getUrlParameter("storage", "");
    var env = getUrlParameter("env", "");
    if (projectid !== "") {
        headers['x-project-id'] = projectid;
    }
    if (spaceid !== "") {
        headers['x-space-id'] = spaceid;
    }
    if (api_version !== "") {
        headers['x-api-version'] = api_version;
    }
    if (serviceid !== "") {
        headers['x-notebook-instance-id'] = serviceid;
    }
    if (env !== "") {
        headers['x-env-type'] = env;
    }
    if (storage_type !== "") {
        headers['x-storage-type'] = storage_type;
        files_api_enabled = true
    }
    $.ajaxSetup({
        headers: headers
      });
    console.log("Default Ajax headers were set");
}

addDefaultHeaders()